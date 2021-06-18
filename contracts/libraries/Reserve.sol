// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;


/// @notice  Engine Reserves
/// @author  Primitive
/// @dev     This library holds the data structure for an Engine's Reserves.

import "./SafeCast.sol";
import "hardhat/console.sol";
library Reserve {
    using SafeCast for uint256;

    // An Engine has two reserves of RISKY and STABLE assets, and total liquidity.
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
    function update(Data storage res, uint32 blockTimestamp) internal returns (Data storage) {
        uint32 deltaTime = blockTimestamp - res.blockTimestamp;
        if(deltaTime > 0) {
            res.cumulativeRisky += res.reserveRisky * deltaTime;
            res.cumulativeStable += res.reserveStable * deltaTime;
            res.cumulativeLiquidity += res.liquidity * deltaTime;
        }
        res.blockTimestamp = blockTimestamp;
        return res;
    }

    /// @notice Increases one reserve value and decreases the other by different amounts
    function swap(
        Data storage reserve,
        bool addXRemoveY,
        uint256 deltaIn,
        uint256 deltaOut,
        uint32 blockTimestamp
    ) internal returns (Data storage) {
        if (addXRemoveY) {
            reserve.reserveRisky += deltaIn.toUint128();
            reserve.reserveStable -= deltaOut.toUint128();
        } else {
            reserve.reserveRisky -= deltaOut.toUint128();
            reserve.reserveStable += deltaIn.toUint128();
        }
        return update(reserve, blockTimestamp);
    }

    /// @notice Add to both reserves and total supply of liquidity
    function allocate(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal returns (Data storage) {
        reserve.reserveRisky += delRisky.toUint128();
        reserve.reserveStable += delStable.toUint128();
        reserve.liquidity += delLiquidity.toUint128();
        return update(reserve, blockTimestamp);
    }

    /// @notice Remove from both reserves and total supply of liquidity
    function remove(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal returns (Data storage) {
        reserve.reserveRisky -= delRisky.toUint128();
        reserve.reserveStable -= delStable.toUint128();
        reserve.liquidity -= delLiquidity.toUint128();
        return update(reserve, blockTimestamp);
    }

    /// @notice Increases available float to borrow, called when lending
    function addFloat(Data storage reserve, uint256 delLiquidity) internal returns (Data storage) {
        reserve.float += delLiquidity.toUint128();
        return reserve;
    }

    /// @notice Reduces available float, taking liquidity off the market, called when claiming
    function removeFloat(Data storage reserve, uint256 delLiquidity) internal returns (Data storage) {
        reserve.float -= delLiquidity.toUint128();
        return reserve;
    }

    /// @notice Reduces float and increases debt of the global reserve, called when borrowing
    function borrowFloat(Data storage reserve, uint256 delLiquidity) internal returns (Data storage) {
        reserve.float -= delLiquidity.toUint128();
        reserve.debt += delLiquidity.toUint128();
        return reserve;
    }

    /// @notice Increases float and reduces debt of the global reserve, called when repaying a borrow
    function repayFloat(Data storage reserve, uint256 delLiquidity) internal returns (Data storage) {
        reserve.float += delLiquidity.toUint128();
        reserve.debt -= delLiquidity.toUint128();
        return reserve;
    }
}
