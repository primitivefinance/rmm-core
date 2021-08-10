// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @notice  Position Library
/// @author  Primitive
/// @dev     Generalized position data structure for any engine

import "./SafeCast.sol";

library Position {
    using SafeCast for uint256;

    /// @notice Thrown on attempting to lend more liquidity than available
    error LiquidityError();

    struct Data {
        uint128 float; // Balance of loaned liquidity
        uint128 liquidity; // Balance of liquidity
        uint128 debt; // Balance of liquidity debt that must be paid back, also balance of risky in position
    }

    /// @notice An Engine's mapping of position Ids to Data structs can be used to fetch any position.
    /// @dev    Used across all Engines
    /// @param  positions    Mapping of position Ids to Positions
    /// @param  account      Controlling address of the position
    /// @param  poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    function fetch(
        mapping(bytes32 => Data) storage positions,
        address account,
        bytes32 poolId
    ) internal view returns (Data storage) {
        return positions[getPositionId(account, poolId)];
    }

    /// @notice Add to the balance of liquidity
    function allocate(Data storage position, uint256 delLiquidity) internal {
        require(position.debt == 0, "Debt");
        position.liquidity += delLiquidity.toUint128();
    }

    /// @notice Decrease the balance of liquidity
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity The liquidity to remove
    function remove(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.liquidity -= delLiquidity.toUint128();
    }

    /// @notice Adds a debt balance of `delLiquidity` to `position`
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity The liquidity to borrow
    function borrow(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.debt += delLiquidity.toUint128(); // add the debt post position manipulation
    }

    /// @notice Locks `delLiquidity` of liquidity as a float which can be borrowed from
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity The liquidity to lend
    function lend(
        mapping(bytes32 => Data) storage positions,
        bytes32 poolId,
        uint256 delLiquidity
    ) internal returns (Data storage position) {
        position = fetch(positions, msg.sender, poolId);
        position.float += delLiquidity.toUint128();
        if (position.float > position.liquidity) revert LiquidityError();
    }

    /// @notice Unlocks `delLiquidity` of liquidity by reducing float
    /// @param poolId       Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @param delLiquidity The liquidity to claim
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

    /// @notice  Fetches the position Id, which is an encoded `account` and `poolId`.
    /// @param   account    Controlling address of the position
    /// @param   poolId     Keccak256 hash of the engine address and pool parameters (strike, sigma, maturity)
    /// @return  posId      Keccak hash of the account and poolId
    function getPositionId(address account, bytes32 poolId) internal pure returns (bytes32 posId) {
        posId = keccak256(abi.encodePacked(account, poolId));
    }
}
