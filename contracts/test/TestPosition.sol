// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../libraries/Position.sol";

/// @title   Position Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestPosition {
    using Position for Position.Data;
    using Position for mapping(bytes32 => Position.Data);

    /// @notice Store for testing
    Position.Data public pos;

    /// @notice Stores position data structs using a bytes32 positionId key
    mapping(bytes32 => Position.Data) public positions;

    /// @notice Manpiulates a `pos` storage slot for easy testing
    function edit(Position.Data memory data, bytes32 posId) public {
        pos = positions[posId];
        pos.balanceRisky = data.balanceRisky;
        pos.balanceStable = data.balanceStable;
        pos.liquidity = data.liquidity;
        pos.float = data.float;
    }

    /// @return The position storage item
    function shouldFetch(address where, address owner, bytes32 pid) public view returns (Position.Data memory) {
        return _shouldFetch(where, owner, pid);
    }

    function _shouldFetch(address where, address owner, bytes32 pid) internal view returns (Position.Data memory) {
        return positions.fetch(owner, pid);
    }

    /// @notice Increments a position's liquidity
    /* function shouldAllocate(bytes32 pid, uint amount) public returns (Position.Data memory) {
        pos = positions[pid];
        int256 pre = int256(pos.liquidity);
        positions[pid].allocate(amount);
        int256 post = int256(pos.liquidity);
        assert(post - amount >= pre);
    }

    /// @notice Decrements a position's liquidity
    function shouldRemove(bytes32 pid, address where, uint amount) public returns(Position.Data memory) {
        pos = _shouldFetch(where, msg.sender, pid);
        int256 pre = int256(pos.liquidity);
        positions.remove(pid, amount);
        int256 post = int256(pos.liquidity);
        assert(post + amount >= pre);
    }

    /// @notice Increments debt and balanceRisky for a position
    function shouldBorrow(bytes32 pid, address where, uint amount) public returns(Position.Data memory) {
        pos = _shouldFetch(where, msg.sender, pid);
        int256 pre = int256(pos.liquidity);
        positions.borrow(where, pid, amount);
        int256 post = int256(pos.liquidity);
        assert(post - amount >= pre);
        assert(pos.balanceRisky >= amount);
    }

    /// @notice Increments a position's float
    function shouldLend(bytes32 pid, address where, uint amount) public returns(Position.Data memory) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.float;
        positions.lend(where, pid, amount);
        uint post = pos.float;
        assert(post - amount >= pre);
    }

    /// @notice Decrements a positions float
    function shouldClaim(bytes32 pid, address where, uint amount) public returns(Position.Data memory) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.float;
        positions.borrow(where, pid, amount);
        uint post = pos.float;
        assert(post + amount >= pre);
    }

    /// @notice Decrements a position's debt by reducing its liquidity
    function shouldRepay(bytes32 pid, address where, uint amount) public returns(Position.Data memory) {
        pos = _shouldFetch(where, msg.sender, pid);
        int256 pre = int256(pos.liquidity);
        positions.borrow(where, pid, amount);
        int256 post =int256( pos.liquidity);
        assert(post + amount >= pre);
        assert(pos.balanceRisky >= post);
    } */

    /// @return posId The keccak256 hash of `where` `owner` and `pid` is the position id
    function shouldGetPositionId(address where, address owner, bytes32 pid) public pure returns (bytes32 posId) {
        posId = Position.getPositionId(owner, pid);
    }
}