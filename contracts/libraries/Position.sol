// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Position Library
/// @author  Primitive
/// @dev     Generalized position data structure for any engine.

import "./SafeCast.sol";

library Position {
    using SafeCast for uint256;

    struct Data {
        uint128 float; // Balance of loaned liquidity
        uint128 liquidity; // Balance of liquidity
        uint128 debt; // Balance of liquidity debt that must be paid back, also balance of risky in position
    }

    /// @notice An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev    Used across all Engines.
    /// @param  positions    Mapping of position Ids to Positions
    /// @param  owner        Controlling address of the position
    /// @param  poolId       Keccak256 hash of the pool parameters: strike, volatility, and time until expiry
    function fetch(
        mapping(bytes32 => Data) storage positions,
        address owner,
        bytes32 poolId
    ) internal view returns (Data storage) {
        return positions[getPositionId(owner, poolId)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint256 delLiquidity) internal {
        require(position.debt == 0, "Debt");
        position.liquidity += delLiquidity.toUint128();
    }

    /// @notice Decrease the balance of liquidity
    function remove(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.liquidity -= delLiquidity.toUint128();
    }

    /// @notice Adds a debt balance of `delLiquidity` to `position`
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.debt += delLiquidity.toUint128(); // add the debt post position manipulation
    }

    /// @notice Locks `delLiquidity` of liquidity as a float which can be borrowed from.
    function lend(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.float += delLiquidity.toUint128();
        require(position.liquidity >= position.float, "Not enough liquidity");
    }

    /// @notice Unlocks `delLiquidity` of liquidity by reducing float
    function claim(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.float -= delLiquidity.toUint128();
    }

    /// @notice Reduces `delLiquidity` of position.debt
    function repay(Data storage position, uint256 delLiquidity) internal {
        position.debt -= delLiquidity.toUint128();
    }

    /// @notice  Fetches the position Id, which is an encoded `owner` and `poolId`.
    /// @param   owner      Controlling address of the position
    /// @param   poolId     Keccak hash of the pool parameters: strike, volatility, and time until expiry
    /// @return  posId      Keccak hash of the owner and poolId
    function getPositionId(address owner, bytes32 poolId) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(owner, poolId));
    }
}
