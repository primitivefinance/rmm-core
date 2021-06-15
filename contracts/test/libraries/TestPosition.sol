// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/Position.sol";

/// @title   Position Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestPosition {
    using Position for Position.Data;
    using Position for mapping(bytes32 => Position.Data);

    /// @notice Storage slot for position id for unit tests
    bytes32 public posId;

    /// @notice Stores position data structs using a bytes32 positionId key
    mapping(bytes32 => Position.Data) public positions;

    constructor() {}

    /// @notice Used for testing
    function pos() public view returns (Position.Data memory) {
        return positions[posId];
    }

    /// @notice Called before each unit test
    function beforeEach(bytes32 poolId, uint256 liquidity) public {
        posId = Position.getPositionId(msg.sender, poolId);
        positions[posId] = Position.Data({
            balanceRisky: 0,
            balanceStable: 0,
            float: 0,
            liquidity: uint128(liquidity), // init with {liquidity} units of liquidity
            debt: 0
        });

        Position.Data memory pos = positions.fetch(msg.sender, poolId);
        assert(pos.liquidity == uint128(liquidity));
    }

    /// @return The position storage item
    function shouldFetch(address owner, bytes32 poolId) public view returns (Position.Data memory) {
        return _shouldFetch(owner, poolId);
    }

    function _shouldFetch(address owner, bytes32 poolId) internal view returns (Position.Data memory) {
        return positions.fetch(owner, poolId);
    }

    /// @notice Increments a position's liquidity
    function shouldAllocate(bytes32 poolId, uint256 amount) public returns (Position.Data memory) {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = pos.liquidity;
        positions.fetch(msg.sender, poolId).allocate(amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 post = pos.liquidity;
        assert(post - uint128(amount) >= pre);
    }

    /// @notice Decrements a position's liquidity
    function shouldRemove(bytes32 poolId, uint256 amount) public {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = (pos.liquidity);
        positions.remove(poolId, amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 post = (pos.liquidity);
        assert(post + uint128(amount) >= pre);
    }

    /// @notice Increments debt and balanceRisky for a position
    function shouldBorrow(bytes32 poolId, uint256 amount) public {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = pos.balanceRisky;
        positions.borrow(poolId, amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 post = pos.balanceRisky;
        assert(post >= uint128(amount) + pre);
    }

    /// @notice Increments a position's float
    function shouldLend(bytes32 poolId, uint256 amount) public {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = pos.float;
        positions.lend(poolId, amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 post = pos.float;
        assert(post - uint128(amount) >= pre);
    }

    /// @notice Decrements a positions float
    function shouldClaim(bytes32 poolId, uint256 amount) public {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = pos.float;
        positions.claim(poolId, amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 post = pos.float;
        assert(post + uint128(amount) >= pre);
    }

    /// @notice Decrements a position's debt by reducing its liquidity
    function shouldRepay(bytes32 poolId, uint256 amount) public {
        Position.Data memory pos = _shouldFetch(msg.sender, poolId);
        uint128 pre = pos.debt;
        positions.fetch(msg.sender, poolId).repay(amount);
        pos = _shouldFetch(msg.sender, poolId);
        uint128 debt = pos.debt;
        assert(debt + uint128(amount) >= pre);
    }

    /// @return positionId The keccak256 hash of `where` `owner` and `poolId` is the position id
    function shouldGetPositionId(address owner, bytes32 poolId) public pure returns (bytes32 positionId) {
        positionId = Position.getPositionId(owner, poolId);
    }
}
