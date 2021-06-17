// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

import "hardhat/console.sol";

/// @notice  Position Library
/// @author  Primitive
/// @dev     This library is a generalized position data structure for any engine.

library Position {
    struct Data {
        uint128 balanceRisky; // Balance of risky asset
        uint128 balanceStable; // Balance of stable asset
        uint128 float; // Balance of loaned liquidity
        uint128 liquidity; // Balance of liquidity
        uint128 debt; // Balance of liquidity debt that must be paid back
    }

    /// @notice An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev    Used across all Engines.
    /// @param  positions    Mapping of position Ids to Positions
    /// @param  owner       Controlling address of the position
    /// @param  pid         Keccak256 hash of the pool parameters: strike, volatility, and time until expiry
    function fetch(
        mapping(bytes32 => Data) storage positions,
        address owner,
        bytes32 pid
    ) internal view returns (Data storage) {
        return positions[getPositionId(owner, pid)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint256 deltaL) internal returns (Data storage) {
        position.liquidity += uint128(deltaL);
        return position;
    }

    /// @notice Decrease the balance of liquidity
    function remove(
        mapping(bytes32 => Data) storage positions,
        bytes32 pid,
        uint256 deltaL
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, pid);
        position.liquidity -= uint128(deltaL);
        return position;
    }

    /// @notice Adds a debt balance of `deltaL` to `position`
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 pid,
        uint256 deltaL
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, pid);
        uint128 liquidity = position.liquidity;
        require(liquidity == 0, "Must borrow from 0");
        position.debt += uint128(deltaL); // add the debt post position manipulation
        position.balanceRisky += uint128(deltaL);
        return position;
    }

    /// @notice Locks `deltaL` of liquidity as a float which can be borrowed from.
    function lend(
        mapping(bytes32 => Data) storage positions,
        bytes32 pid,
        uint256 deltaL
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, pid);
        position.float += uint128(deltaL);
        require(uint256(position.liquidity) >= uint256(position.float), "Not enough liquidity");
        return position;
    }

    /// @notice Unlocks `deltaL` of liquidity by reducing float
    function claim(
        mapping(bytes32 => Data) storage positions,
        bytes32 pid,
        uint256 deltaL
    ) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, pid);
        position.float -= uint128(deltaL);
        return position;
    }

    /// @notice Reduces `deltaL` of position.debt by reducing `deltaL` of position.liquidity
    function repay(Data storage position, uint256 deltaL) internal returns (Data storage) {
        position.liquidity -= uint128(deltaL);
        // FIX: Contract too large, position.debt -= uint128(deltaL);
        return position;
    }

    /// @notice  Fetches the position Id, which is an encoded `owner` and `pid`.
    /// @param   owner  Controlling address of the position
    /// @param   pid    Keccak hash of the pool parameters: strike, volatility, and time until expiry
    /// @return  posId  Keccak hash of the owner and pid
    function getPositionId(address owner, bytes32 pid) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(owner, pid));
    }
}
