// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

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
            float: 0,
            liquidity: uint128(liquidity), // init with {liquidity} units of liquidity
            collateralRisky: 0,
            collateralStable: 0,
            feeRiskyGrowthLast: 0,
            feeStableGrowthLast: 0
        });

        Position.Data memory position = positions.fetch(msg.sender, poolId);
        assert(position.liquidity == uint128(liquidity));
    }

    /// @return The position storage item
    function shouldFetch(address owner, bytes32 poolId) public view returns (Position.Data memory) {
        return _shouldFetch(owner, poolId);
    }

    function _shouldFetch(address owner, bytes32 poolId) internal view returns (Position.Data memory) {
        return positions.fetch(owner, poolId);
    }

    /// @notice Increments a position's liquidity
    function shouldAllocate(bytes32 poolId, uint256 amount) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 pre = position.liquidity;
        positions.fetch(msg.sender, poolId).allocate(amount);
        position = _shouldFetch(msg.sender, poolId);
        uint128 post = position.liquidity;
        assert(post - uint128(amount) >= pre);
    }

    /// @notice Decrements a position's liquidity
    function shouldRemove(bytes32 poolId, uint256 amount) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 pre = (position.liquidity);
        positions.remove(poolId, amount);
        position = _shouldFetch(msg.sender, poolId);
        uint128 post = (position.liquidity);
        assert(post + uint128(amount) >= pre);
    }

    /// @notice Increments a position's float
    function shouldSupply(bytes32 poolId, uint256 amount) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 pre = position.float;
        positions.supply(poolId, amount);
        position = _shouldFetch(msg.sender, poolId);
        uint128 post = position.float;
        assert(post - uint128(amount) >= pre);
    }

    /// @notice Decrements a positions float
    function shouldClaim(bytes32 poolId, uint256 amount) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 pre = position.float;
        positions.claim(poolId, amount);
        position = _shouldFetch(msg.sender, poolId);
        uint128 post = position.float;
        assert(post + uint128(amount) >= pre);
    }

    /// @notice Increments debt for a position
    function shouldBorrow(
        bytes32 poolId,
        uint256 collateralRisky,
        uint256 collateralStable
    ) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 preRisky = position.collateralRisky;
        uint128 preStable = position.collateralStable;
        positions.borrow(poolId, collateralRisky, collateralStable);
        position = _shouldFetch(msg.sender, poolId);
        uint128 postRisky = position.collateralRisky;
        uint128 postStable = position.collateralStable;
        assert(postRisky >= uint128(collateralRisky) + preRisky);
        assert(postStable >= uint128(collateralStable) + preStable);
    }

    /// @notice Decrements a position's debt by reducing its liquidity
    function shouldRepay(
        bytes32 poolId,
        uint256 riskyToLiquidate,
        uint256 stableToLiquidate
    ) public {
        Position.Data memory position = _shouldFetch(msg.sender, poolId);
        uint128 preRisky = position.collateralRisky;
        uint128 preStable = position.collateralStable;
        positions.fetch(msg.sender, poolId).repay(riskyToLiquidate, stableToLiquidate);
        position = _shouldFetch(msg.sender, poolId);
        uint128 collateralRisky = position.collateralRisky;
        uint128 collateralStable = position.collateralStable;
        assert(collateralRisky + uint128(riskyToLiquidate) >= preRisky);
        assert(collateralStable + uint128(stableToLiquidate) >= preStable);
    }

    /// @return positionId The keccak256 hash of `where` `owner` and `poolId` is the position id
    function shouldGetPositionId(address owner, bytes32 poolId) public pure returns (bytes32 positionId) {
        positionId = Position.getPositionId(owner, poolId);
    }
}
