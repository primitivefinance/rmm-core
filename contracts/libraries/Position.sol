// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Position Library
/// @author  Primitive
/// @dev     This library is a generalized position data structure for any engine.

interface IBorrow {
    function borrowCallback(Position.Data calldata pos, uint deltaL) external returns (uint);
}

library Position {
    struct Data {
        address owner;  // Address that controls the position
        bytes32 pid;    // Keccak hash of the engine factory and calibration
        uint balanceRisky;  // Balance of risky asset
        uint balanceStable;  // Balance of stable asset
        uint liquidity; // Balance of liquidity
        uint float;     // Balance of loaned liquidity
        uint debt;      // Balance of borrowed liquidity
    }

    /// @notice  An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev     Used across all Engines.
    function fetch(
        mapping(bytes32 => Data) storage position,
        address where,
        address owner,
        bytes32 pid
    ) internal returns (Data storage) {
         return position[getPositionId(where, owner, pid)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint deltaL) internal returns (Data storage) {
        position.liquidity += deltaL;
        return position;
    }

    /// @notice Decrease the balance of liquidity
    function remove(mapping(bytes32 => Data) storage positions, address where, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, where, msg.sender, pid);
        position.liquidity -= deltaL;
        return position;
    }

    /// @notice Adds a debt balance of `deltaL` to `position`
    function borrow(mapping(bytes32 => Data) storage positions, address where, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, where, msg.sender, pid);
        position.debt += deltaL; // add the debt post position manipulation
        position.balanceRisky += deltaL;
        return position;
    }

    /// @notice Locks `deltaL` of liquidity as a float which can be borrowed from.
    function lend(mapping(bytes32 => Data) storage positions, address where, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, where, msg.sender, pid);
        position.float += deltaL;
        require(position.liquidity >= position.float, "Not enough liquidity");
        return position;
    }

    /// @notice Unlocks `deltaL` of liquidity by reducing float
    function claim(mapping(bytes32 => Data) storage positions, address where, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, where, msg.sender, pid);
        position.float -= deltaL;
        return position;
    }

    /// @notice Reduces `deltaL` of position.debt by reducing `deltaL` of position.liquidity
    function repay(Data storage position, uint deltaL) internal returns (Data storage) {
        position.debt -= deltaL;
        return position;
    }

    /// @notice  Fetches the position Id, which is an encoded `owner`, `nonce`, and  `pid`.
    /// @return  The position Id as a bytes32.
    function getPositionId(address where, address owner, bytes32 pid) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(where, owner, pid));
    }
}
