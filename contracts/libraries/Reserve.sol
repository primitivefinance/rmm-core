// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @notice  Engine Reserves
/// @author  Primitive
/// @dev     Data structure library for an Engine's Reserves.

import "./SafeCast.sol";

library Reserve {
    using SafeCast for uint256;

    // An Engine has two reserves of RISKY and STABLE assets, total liquidity, and cumulative balances.
    struct Data {
        uint128 reserveRisky; // reserve for the risky asset
        uint128 reserveStable; // reserve for the stable asset
        uint128 liquidity; // total supply of liquidity
        uint128 float; // liquidity available for lending
        uint128 debt; // liquidity unavailable because it was borrowed
        uint32 blockTimestamp; // last timestamp for updated cumulative reserves
        uint256 cumulativeRisky;
        uint256 cumulativeStable;
        uint256 cumulativeLiquidity;
    }

    /// @notice Adds to the cumulative reserves
    /// @param  res             Reserve storage to update
    /// @param  blockTimestamp  Checkpoint timestamp of update
    function update(Data storage res, uint32 blockTimestamp) internal {
        uint32 deltaTime = blockTimestamp - res.blockTimestamp;
        if (deltaTime > 0) {
            res.cumulativeRisky += res.reserveRisky * deltaTime;
            res.cumulativeStable += res.reserveStable * deltaTime;
            res.cumulativeLiquidity += res.liquidity * deltaTime;
        }
        res.blockTimestamp = blockTimestamp;
    }

    /// @notice Increases one reserve value and decreases the other by different amounts
    /// @param  reserve         Reserve storage to update
    /// @param  riskyForStable  Direction of swap
    /// @param  deltaIn         Amount of tokens paid
    /// @param  deltaOut        Amount of tokens sent out
    /// @param  blockTimestamp  Checkpoint timestamp of swap
    function swap(
        Data storage reserve,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        uint32 blockTimestamp
    ) internal {
        if (riskyForStable) {
            reserve.reserveRisky += deltaIn.toUint128();
            reserve.reserveStable -= deltaOut.toUint128();
        } else {
            reserve.reserveRisky -= deltaOut.toUint128();
            reserve.reserveStable += deltaIn.toUint128();
        }
        update(reserve, blockTimestamp);
    }

    /// @notice Add to both reserves and total supply of liquidity
    /// @param  reserve         Reserve storage to manipulate
    /// @param  delRisky        Amount of risky tokens to add to the reserve
    /// @param  delStable       Amount of stable tokens to add to the reserve
    /// @param  delLiquidity    Amount of liquidity minted with the provided tokens
    /// @param  blockTimestamp  Checkpoint timestamp of allocation
    function allocate(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal {
        reserve.reserveRisky += delRisky.toUint128();
        reserve.reserveStable += delStable.toUint128();
        reserve.liquidity += delLiquidity.toUint128();
        update(reserve, blockTimestamp);
    }

    /// @notice Remove from both reserves and total supply of liquidity
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
        reserve.reserveRisky -= delRisky.toUint128();
        reserve.reserveStable -= delStable.toUint128();
        reserve.liquidity -= delLiquidity.toUint128();
        update(reserve, blockTimestamp);
    }

    /// @notice Increases available float to borrow, called when lending
    /// @param reserve      Reserve storage to manipulate
    /// @param delLiquidity Amount of liquidity to add to float
    function addFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float += delLiquidity.toUint128();
    }

    /// @notice Reduces available float, taking liquidity off the market, called when claiming
    /// @param reserve      Reserve storage to manipulate
    /// @param delLiquidity Amount of liquidity to remove from float
    function removeFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float -= delLiquidity.toUint128();
    }

    /// @notice Reduces float and increases debt of the global reserve, called when borrowing
    /// @param reserve      Reserve storage to manipulate
    /// @param delLiquidity Amount of liquidity to remove from float and add to debt
    function borrowFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float -= delLiquidity.toUint128();
        reserve.debt += delLiquidity.toUint128();
    }

    /// @notice Increases float and reduces debt of the global reserve, called when repaying a borrow
    /// @param reserve      Reserve storage to manipulate
    /// @param delLiquidity Amount of liquidity to add to float and remove from debt
    function repayFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float += delLiquidity.toUint128();
        reserve.debt -= delLiquidity.toUint128();
    }
}
