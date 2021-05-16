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
    // every position in an Engine is this data structure.
    struct Data {
        // the address which can withdraw balances
        address owner;
        // Transiently set as true when a position is being edited.
        bool unlocked;
        // the nonce of the position, which is iterated for each engine
        uint nonce;
        uint BX1; // Balance of risky asset
        uint BY2; // Balance of riskless asset
        // The pool ID of the liquidity shares
        bytes32 pid;
        // Balance of X, the RISKY, or underlying asset.
        uint liquidity;
        // The amount of liquidity shares lent out.
        uint float;
        // The amount of liquidity shares borrowed.
        uint debt;
    }

    /// @notice  An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev     Used across all Engines.
    function fetch(
        mapping(bytes32 => Data) storage position,
        address owner,
        uint nonce,
        bytes32 pid
    ) internal returns (Data storage) {
         return position[getPositionId(owner, nonce, pid)];
    }

    /// @notice Add to the balance of liquidity
    function addLiquidity(Data storage position, uint deltaL) internal returns (Data storage) {
        position.liquidity += deltaL;
        return position;
    }

    /// @notice Decrease the balance of liquidity
    function removeLiquidity(mapping(bytes32 => Data) storage positions, uint nonce, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, nonce, pid);
        require(position.debt == uint(0), "Has debt");
        position.liquidity -= deltaL;
        return position;
    }

    /// @notice Adds a debt balance of `deltaL` to `position`
    function borrow(mapping(bytes32 => Data) storage positions, uint nonce, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, nonce, pid);
        position.liquidity += deltaL; // increase liquidity
        IBorrow(msg.sender).borrowCallback(position, deltaL); // trigger the callback so we can remove liquidity
        position.debt += deltaL; // add the debt post position manipulation
        require(position.BX1 >= deltaL, "Check the borrow factor invariant");
        return position;
    }

    /// @notice Locks `deltaL` of liquidity as a float which can be borrowed from.
    function lend(mapping(bytes32 => Data) storage positions, uint nonce, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, nonce, pid);
        position.float += deltaL;
        require(position.liquidity >= position.float, "Not enough liquidity");
        return position;
    }

    /// @notice Unlocks `deltaL` of liquidity by reducing float
    function claim(mapping(bytes32 => Data) storage positions, uint nonce, bytes32 pid, uint deltaL) internal returns (Data storage) {
        Data storage position = fetch(positions, msg.sender, nonce, pid);
        position.float -= deltaL;
        return position;
    }

    /// @notice Reduces `deltaL` of position.debt by reducing `deltaL` of position.liquidity
    function repay(Data storage position, uint deltaL) internal returns (Data storage) {
        require(position.debt >= uint(0), "No loan to repay");
        position.liquidity -= deltaL;
        position.debt -= deltaL;
        return position;
    }

    /// @notice  Fetches the position Id, which is an encoded `owner`, `nonce`, and  `pid`.
    /// @return  The position Id as a bytes32.
    function getPositionId(address owner, uint nonce, bytes32 pid) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(owner, nonce, pid));
    }
}
