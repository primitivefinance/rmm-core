// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @notice  Reserves Library
/// @author  Primitive
/// @dev     Data structure library for an Engine's Reserves

import "./SafeCast.sol";

library Reserve {
    using SafeCast for uint256;

    /// @notice Thrown on attempting to supply more liquidity than is allowed
    error LiquidityError();

    struct Data {
        uint128 reserveRisky; // reserve of the risky asset
        uint128 reserveStable; // reserve of the stable asset
        uint128 liquidity; // total supply of liquidity
        uint128 float; // liquidity supplied to be borrowed
        uint128 collateralRisky; // amount of risky tokens stored as collateral, where 1 risky = 1 liquidity debt
        uint128 collateralStable; // amount of stable tokens stored as collateral, where K stable = 1 liquidity debt
        uint32 blockTimestamp; // last timestamp of updated cumulative reserves
        uint256 feeRiskyGrowth; // all time risky fees paid per float
        uint256 feeStableGrowth; // // all time stable fees paid per float
        uint256 cumulativeRisky; // cumulative sum of risky reserves
        uint256 cumulativeStable; // cumulative sum of stable reserves
        uint256 cumulativeLiquidity; // cumulative sum of total liquidity supply
    }

    /// @notice                 Adds to the cumulative reserves
    /// @dev                    Overflow is desired on the cumulative values
    /// @param  res             Reserve storage to update
    /// @param  blockTimestamp  Checkpoint timestamp of update
    function update(Data storage res, uint32 blockTimestamp) internal {
        uint32 deltaTime = blockTimestamp - res.blockTimestamp;
        // overflow is desired
        if (deltaTime > 0) {
            unchecked {
                res.cumulativeRisky += res.reserveRisky * deltaTime;
                res.cumulativeStable += res.reserveStable * deltaTime;
                res.cumulativeLiquidity += res.liquidity * deltaTime;
            }
        }
        res.blockTimestamp = blockTimestamp;
    }

    /// @notice                 Increases one reserve value and decreases the other
    /// @param  reserve         Reserve storage to update
    /// @param  riskyForStable  Direction of swap
    /// @param  deltaIn         Amount of tokens paid, increases one reserve by
    /// @param  deltaOut        Amount of tokens sent out, decreases the other reserve by
    /// @param  blockTimestamp  Checkpoint timestamp of swap
    function swap(
        Data storage reserve,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        if (riskyForStable) {
            reserve.reserveRisky += deltaIn.toUint128();
            reserve.reserveStable -= deltaOut.toUint128();
        } else {
            reserve.reserveRisky -= deltaOut.toUint128();
            reserve.reserveStable += deltaIn.toUint128();
        }
    }

    /// @notice                 Add to both reserves and total supply of liquidity
    /// @param  reserve         Reserve storage to manipulate
    /// @param  delRisky        Amount of risky tokens to add to the reserve
    /// @param  delStable       Amount of stable tokens to add to the reserve
    /// @param  delLiquidity    Amount of liquidity created with the provided tokens
    /// @param  blockTimestamp  Checkpoint timestamp of allocation
    function allocate(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        reserve.reserveRisky += delRisky.toUint128();
        reserve.reserveStable += delStable.toUint128();
        reserve.liquidity += delLiquidity.toUint128();
    }

    /// @notice                 Remove from both reserves and total supply of liquidity
    /// @param  reserve         Reserve storage to manipulate
    /// @param  delRisky        Amount of risky tokens to remove to the reserve
    /// @param  delStable       Amount of stable tokens to remove to the reserve
    /// @param  delLiquidity    Amount of liquidity burned with the provided tokens
    /// @param  blockTimestamp  Checkpoint timestamp of removal
    function remove(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        reserve.reserveRisky -= delRisky.toUint128();
        reserve.reserveStable -= delStable.toUint128();
        reserve.liquidity -= delLiquidity.toUint128();
        checkUtilization(reserve);
    }

    /// @notice                 Increases available float to borrow, called when supplying
    /// @param reserve          Reserve storage to manipulate
    /// @param delLiquidity     Amount of liquidity to add to float
    function addFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float += delLiquidity.toUint128();
        checkUtilization(reserve);
    }

    /// @notice                 Reduces available float, called when claiming
    /// @param reserve          Reserve storage to manipulate
    /// @param delLiquidity     Amount of liquidity to remove from float
    function removeFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float -= delLiquidity.toUint128();
    }

    /// @notice                 Reduces float and increases debt of the global reserve, called when borrowing
    /// @param reserve          Reserve storage to manipulate
    /// @param delLiquidity     Amount of liquidity to remove from float and add to debt
    function borrowFloat(
        Data storage reserve,
        uint256 delLiquidity,
        uint256 collateralRisky,
        uint256 collateralStable
    ) internal {
        reserve.float -= delLiquidity.toUint128();
        reserve.collateralRisky += collateralRisky.toUint128();
        reserve.collateralStable += collateralStable.toUint128();
    }

    /// @notice                 Increases float and reduces debt of the global reserve, called when repaying a borrow
    /// @param reserve          Reserve storage to manipulate
    /// @param delLiquidity     Amount of liquidity to add to float and remove from debt
    function repayFloat(
        Data storage reserve,
        uint256 delLiquidity,
        uint256 collateralRisky,
        uint256 collateralStable
    ) internal {
        reserve.float += delLiquidity.toUint128();
        reserve.collateralRisky -= collateralRisky.toUint128();
        reserve.collateralStable -= collateralStable.toUint128();
        checkUtilization(reserve);
    }

    /// @notice                 Increases the extra fees from positive invariants and borrows
    /// @dev                    Overflow possible. These are checkpoints, not absolute fees
    /// @param reserve          Reserve in storage to manipulate
    /// @param feeRisky         Amount of absolute fees in risky token to add
    /// @param feeStable        Amount of absolute fees in stable token to add
    function addFee(
        Data storage reserve,
        uint256 feeRisky,
        uint256 feeStable
    ) internal {
        unchecked {
            reserve.feeRiskyGrowth += (feeRisky * 1e18) / reserve.float; // float has 18 precision
            reserve.feeStableGrowth += (feeStable * 1e18) / reserve.float;
        }
    }

    /// @notice                 Calculates risky and stable token amounts of `delLiquidity`
    /// @param reserve          Reserve in memory to use reserves and liquidity of
    /// @param delLiquidity     Amount of liquidity to fetch underlying tokens of
    /// @return delRisky        Amount of risky tokens controlled by `delLiquidity`
    /// delStable               Amount of stable tokens controlled by `delLiquidity`
    function getAmounts(Data memory reserve, uint256 delLiquidity)
        internal
        pure
        returns (uint256 delRisky, uint256 delStable)
    {
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity;
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity;
    }

    /// @notice                 Calculates amount of liquidity implied from collateral amounts
    /// @dev                    Scales intermediary token values up to a precision of 1e18
    /// @param reserve          Reserves to calculate underlying token amounts of
    /// @param collateralRisky  Wei value of the risky token with the token's native decimals
    /// @param collateralStable Wei value of the stable token with the token's native decimals
    /// @param precisionRisky   Factor to scale risky token amounts by, 10**riskyTokenDecimals
    /// @param precisionStable  Factor to scale stable token amounts by, 10**stableTokenDecimals
    /// @param strike           Strike price of pool with 18 decimals, 10**18, will scale by stable precision
    /// @return delLiquidity    Amount of debt incurred with desired collateralRisky/Stable amounts, 1e18 precision
    /// delRisky                Amount of risky tokens underlying `delLiquidity`, native precision
    /// delStable               Amount of stable tokens underlying `delLiquidity`, native precision
    function getBorrowAmounts(
        Data memory reserve,
        uint256 collateralRisky,
        uint256 collateralStable,
        uint256 precisionRisky,
        uint256 precisionStable,
        uint256 strike
    )
        internal
        pure
        returns (
            uint256 delLiquidity,
            uint256 delRisky,
            uint256 delStable
        )
    {
        uint256 stablePerStrike = (collateralStable * precisionStable) / strike;
        delLiquidity = (collateralRisky * 1e18) / precisionRisky + (stablePerStrike * 1e18) / precisionStable;
        (delRisky, delStable) = getAmounts(reserve, delLiquidity);
    }

    /// @notice                 Reverts if the outstanding float is > 80% of liquidity
    /// @param reserve          Reserve to check
    function checkUtilization(Data memory reserve) internal pure {
        if ((reserve.float * 1000) / reserve.liquidity > 800) revert LiquidityError();
    }
}
