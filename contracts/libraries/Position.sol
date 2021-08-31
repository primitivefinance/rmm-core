// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @notice  Position Library
/// @author  Primitive
/// @dev     Data structure for any Engine Position

import "./SafeCast.sol";

library Position {
    using SafeCast for uint256;

    struct Data {
        uint128 float; // Balance of supplied liquidity
        uint128 liquidity; // Balance of liquidity
        uint128 riskyCollateral; // For every 1 risky collateral, 1 liquidity debt
        uint128 stableCollateral; // For every K stable collateral (K is strike price), 1 liquidity debt
        uint256 feeRiskyGrowthLast; // fee growth per liquidity in risky, to measure fees entitled
        uint256 feeStableGrowthLast; // fee growth per liquidity in stable, to measure fees entitled
    }

    /// @notice             An Engine's mapping of position Ids to Position.Data structs can be used to fetch any Position
    /// @param  positions   Mapping of position Ids to Positions
    /// @param  account     Controlling address of the Position
    /// @param  poolId      Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    function fetch(
        mapping(bytes32 => Data) storage positions,
        address account,
        bytes32 poolId
    ) internal view returns (Data storage) {
        return positions[getPositionId(account, poolId)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint256 delLiquidity) internal {
        position.liquidity += delLiquidity.toUint128();
    }

    /// @notice             Decrease the balance of liquidity of the `msg.sender`'s Position
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity Amount of liquidity to remove
    function remove(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.liquidity -= delLiquidity.toUint128();
    }

    /// @notice             Supplies liquidity in float, locking it until claimed
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity Amount of liquidity to supply
    function supply(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.float += delLiquidity.toUint128();
        position.liquidity -= delLiquidity.toUint128();
    }

    /// @notice             Removes liquidity from float, unlocking it
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity Amount of liquidity to claim
    function claim(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.float -= delLiquidity.toUint128();
        position.liquidity += delLiquidity.toUint128();
    }

    /// @notice             Increases collateral balances of the Position from increasing liquidity debt
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param riskyCollateral  Amount of risky to hold as collateral for risky / 1 = units of debt
    /// @param stableCollateral Amount of stable to hold as collateral for stable / K = units of debt
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 riskyCollateral,
        uint256 stableCollateral
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        if (riskyCollateral > 0) position.riskyCollateral += riskyCollateral.toUint128();
        if (stableCollateral > 0) position.stableCollateral += stableCollateral.toUint128();
    }

    /// @notice             Reduces Position's collateral balance, by reducing liquidity debt
    /// @param position     Position in state to manipulate
    /// @param riskyCollateral  Amount of risky collateral to liquidate by repaying risky / 1 = units of debt
    /// @param stableCollateral Amount of stable collateral to liquidate by repaying stable / K = units of debt
    function repay(
        Data storage position,
        uint256 riskyCollateral,
        uint256 stableCollateral
    ) internal {
        if (riskyCollateral > 0) position.riskyCollateral -= riskyCollateral.toUint128();
        if (stableCollateral > 0) position.stableCollateral -= stableCollateral.toUint128();
    }

    /// @notice                 Updates the position fee growth and returns fee amounts accrued
    /// @param position         Position in memory to use fee checkpoint and liquidity of
    /// @param feeRiskyGrowth   Amount of global risky fee growth in the reserve
    /// @param feeStableGrowth  Amount of global stable fee growth in the reserve
    /// @return feeRisky        Amount of risky fees accrued, to be given to position owner
    /// feeStable               Amount of stable fees accrued, to be given to position owner
    function updateFeeGrowth(
        Data storage position,
        uint256 feeRiskyGrowth,
        uint256 feeStableGrowth
    ) internal returns (uint256 feeRisky, uint256 feeStable) {
        feeRisky = ((feeRiskyGrowth - position.feeRiskyGrowthLast) * position.liquidity) / 1e18;
        feeStable = ((feeStableGrowth - position.feeStableGrowthLast) * position.liquidity) / 1e18;
        position.feeRiskyGrowthLast = feeRiskyGrowth;
        position.feeStableGrowthLast = feeStableGrowth;
    }

    /// @notice                 Calculates fee amounts of risky and stable accrued
    /// @param position         Position in memory to use fee checkpoint and liquidity of
    /// @param feeRiskyGrowth   Amount of global risky fee growth in the reserve
    /// @param feeStableGrowth  Amount of global stable fee growth in the reserve
    /// @return feeRisky        Amount of risky fees accrued
    /// feeStable               Amount of stable fees accrued
    function getFeeAmounts(
        Data memory position,
        uint256 feeRiskyGrowth,
        uint256 feeStableGrowth
    ) internal pure returns (uint256 feeRisky, uint256 feeStable) {
        feeRisky = ((feeRiskyGrowth - position.feeRiskyGrowthLast) * position.liquidity) / 1e18;
        feeStable = ((feeStableGrowth - position.feeStableGrowthLast) * position.liquidity) / 1e18;
    }

    /// @notice             Fetches the position Id
    /// @param   account    Controlling address of the position
    /// @param   poolId     Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @return  posId      Keccak hash of the account and poolId
    function getPositionId(address account, bytes32 poolId) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(account, poolId));
    }
}
