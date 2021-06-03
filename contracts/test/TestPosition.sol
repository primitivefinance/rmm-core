// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../libraries/Position.sol";

contract TestPosition {
    using Position for Position.Data;
    using Position for mapping(bytes32 => Position.Data);

    Position.Data public pos;
    mapping(bytes32 => Position.Data) public positions;

    function edit(Position.Data memory data, bytes32 posId) public {
        pos = positions[posId];
        pos.balanceRisky = data.balanceRisky;
        pos.balanceStable = data.balanceStable;
        pos.liquidity = data.liquidity;
        pos.float = data.float;
        pos.debt = data.debt;
    }

    function shouldFetch(address where, address owner, bytes32 pid) public view returns (Position.Data storage) {
        return _shouldFetch(where, owner, pid);
    }

    function _shouldFetch(address where, address owner, bytes32 pid) internal view returns (Position.Data storage) {
        return positions.fetch(where, owner, pid);
    }

    function shouldAllocate(bytes32 pid, uint amount) public returns(Position.Data storage) {
        pos = positions[pid];
        uint pre = pos.liquidity;
        positions[pid].allocate(amount);
        uint post = pos.liquidity;
        assert(post - amount >= pre);
    }

    function shouldRemove(bytes32 pid, address where, uint amount) public returns(Position.Data storage) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.liquidity;
        positions.remove(where, pod, amount);
        uint post = pos.liquidity;
        assert(post + amount >= pre);
    }

    function shouldBorrow(bytes32 pid, address where, uint amount) public returns(Position.Data storage) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.debt;
        positions.borrow(where, pid, amount);
        uint post = pos.debt;
        assert(post - amount >= pre);
        assert(pos.balanceRisky >= amount);
    }

    function shouldLend(bytes32 pid, address where, uint amount) public returns(Position.Data storage) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.float;
        positions.lend(where, pid, amount);
        uint post = pos.float;
        assert(post - amount >= pre);
    }

    function shouldClaim(bytes32 pid, address where, uint amount) public returns(Position.Data storage) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.float;
        positions.borrow(where, pid, amount);
        uint post = pos.float;
        assert(post + amount >= pre);
    }

    function shouldRepay(bytes32 pid, address where, uint amount) public returns(Position.Data storage) {
        pos = _shouldFetch(where, msg.sender, pid);
        uint pre = pos.debt;
        positions.borrow(where, pid, amount);
        uint post = pos.debt;
        assert(post + amount >= pre);
        assert(pos.riskyBalance >= post);
    }

    function shouldGetPositionId(address where, address owner, bytes32 pid) public pure returns (bytes32 posId) {
        posId = Position.getPositionId(where, owner, pid);
    }
}