// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @notice  Position Library
/// @author  Primitive
/// @dev     Data structure for any Engine Position

import "./SafeCast.sol";

library Position {
    using SafeCast for uint256;

    /// @notice Thrown on attempting to supply more liquidity than available
    error LiquidityError();

    struct Data {
        uint128 float; // Balance of supplied liquidity
        uint128 liquidity; // Balance of liquidity
        uint128 debt; // Balance of liquidity debt that must be paid back, also balance of risky in position
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

    /// @notice             Increases debt balance of Position
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity Amount of liquidity to borrow
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.debt += delLiquidity.toUint128(); // add the debt post position manipulation
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
        if (position.float > position.liquidity) revert LiquidityError();
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
    }

    /// @notice             Reduces Position debt
    /// @param position     Position in state to manipulate
    /// @param delLiquidity Amount of debt to reduce from the Position
    function repay(Data storage position, uint256 delLiquidity) internal {
        position.debt -= delLiquidity.toUint128();
    }

    /// @notice             Fetches the position Id
    /// @param   account    Controlling address of the position
    /// @param   poolId     Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @return  posId      Keccak hash of the account and poolId
    function getPositionId(address account, bytes32 poolId) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(account, poolId));
    }
}
