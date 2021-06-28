// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Position Library
/// @author  Primitive
/// @dev     This library is a generalized position data structure for any engine.

import "./SafeCast.sol";
import "hardhat/console.sol";

library Position {
    using SafeCast for uint256;

    struct Data {
        uint128 balanceRisky; // Balance of risky asset
        uint128 balanceStable; // Balance of stable asset
        uint128 float; // Balance of loaned liquidity
        uint128 liquidity; // Balance of liquidity, which is negative if a debt exists
        uint128 debt; // Balance of liquidity debt that must be paid back
    }

    /// @notice An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev    Used across all Engines.
    /// @param  positions    Mapping of position Ids to Positions
    /// @param  owner       Controlling address of the position
    /// @param  poolId         Keccak256 hash of the pool parameters: strike, volatility, and time until expiry
    function fetch(
        mapping(bytes32 => Data) storage positions,
        address owner,
        bytes32 poolId
    ) internal view returns (Data storage) {
        return positions[getPositionId(owner, poolId)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint256 delLiquidity) internal returns (Data storage) {
        position.liquidity += delLiquidity.toUint128();
        return position;
    }

    /// @notice Decrease the balance of liquidity
    function remove(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, poolId);
        position.liquidity -= delLiquidity.toUint128();
        return position;
    }

    /// @notice Adds a debt balance of `delLiquidity` to `position`
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, poolId);
        uint128 liquidity = position.liquidity;
        require(liquidity == 0, "Must borrow from 0");
        position.debt += delLiquidity.toUint128(); // add the debt post position manipulation
        position.balanceRisky += delLiquidity.toUint128();
        return position;
    }

    /// @notice Locks `delLiquidity` of liquidity as a float which can be borrowed from.
    function lend(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, poolId);
        position.float += delLiquidity.toUint128();
        require(position.liquidity >= position.float, "Not enough liquidity");
        return position;
    }

    /// @notice Unlocks `delLiquidity` of liquidity by reducing float
    function claim(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, poolId);
        position.float -= delLiquidity.toUint128();
        return position;
    }

    /// @notice Reduces `delLiquidity` of position.debt by reducing `delLiquidity` of position.liquidity
    function repay(Data storage position, uint256 delLiquidity) internal returns (Data storage) {
        position.balanceRisky -= delLiquidity.toUint128();
        position.debt -= delLiquidity.toUint128();
        return position;
    }

    /// @notice  Fetches the position Id, which is an encoded `owner` and `poolId`.
    /// @param   owner  Controlling address of the position
    /// @param   poolId    Keccak hash of the pool parameters: strike, volatility, and time until expiry
    /// @return  posId  Keccak hash of the owner and poolId
    function getPositionId(address owner, bytes32 poolId) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(owner, poolId));
    }
}
