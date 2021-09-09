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
        uint32 blockTimestamp; // last timestamp of updated cumulative reserves
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
            res.blockTimestamp = blockTimestamp;
        }
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
        uint256 liq = uint256(reserve.liquidity);
        delRisky = (delLiquidity * uint256(reserve.reserveRisky)) / liq;
        delStable = (delLiquidity * uint256(reserve.reserveStable)) / liq;
    }
}
