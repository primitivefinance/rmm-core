// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

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
    function addFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float += delLiquidity.toUint128();
    }

    /// @notice Reduces available float, taking liquidity off the market, called when claiming
    function removeFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float -= delLiquidity.toUint128();
    }

    /// @notice Reduces float and increases debt of the global reserve, called when borrowing
    function borrowFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float -= delLiquidity.toUint128();
        reserve.debt += delLiquidity.toUint128();
    }

    /// @notice Increases float and reduces debt of the global reserve, called when repaying a borrow
    function repayFloat(Data storage reserve, uint256 delLiquidity) internal {
        reserve.float += delLiquidity.toUint128();
        reserve.debt -= delLiquidity.toUint128();
    }
}
