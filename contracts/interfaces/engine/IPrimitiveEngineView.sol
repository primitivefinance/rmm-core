// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The view functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice Fetches expected stable token reserves using risky reserve balance
    /// @param  poolId        Keccak256 hash of strike price, volatility, and maturity timestamp
    /// @param  reserveRisky  Current reserve of risky tokens
    /// @return reserveStable Expected stable token reserve
    function getStableGivenRisky(bytes32 poolId, uint256 reserveRisky) external view returns (int128 reserveStable);

    /// @notice Fetches expected risky token reserves using stable reserve balance
    /// @param  poolId        Keccak256 hash of strike price, volatility, and maturity timestamp
    /// @param  reserveStable Current reserve of stable tokens
    /// @return reserveRisky  Expected risky token reserve
    function getRiskyGivenStable(bytes32 poolId, uint256 reserveStable) external view returns (int128 reserveRisky);

    /// @notice Fetches the current invariant based on risky and stable token reserves of pool with `poolId`
    /// @param  poolId The pool id to get the invariant of
    /// invariant
    function invariantOf(bytes32 poolId) external view returns (int128);

    // ===== Immutables =====
    //// The factory address which deployed this engine contract
    function factory() external view returns (address);

    //// The risky token address
    function risky() external view returns (address);

    /// The stable token address
    function stable() external view returns (address);

    // ===== Pool States =====
    /// @notice             Fetches the global reserve state for a pool with `poolId`
    /// @param poolId       Pool id keccak256 hash of strike price, volatility, and maturity timestamp
    /// @return             reserveRisky risky balance
    /// reserveStable       risk free balance
    /// liquidity           total liquidity shares
    /// float               liquidity shares available to be borrowed
    /// debt                total borrow liquidity shares
    /// blockTimestamp      unix timestamp when the cumulative reserve values were last updated
    /// cumulativeRisky     tracks cumulative risky reserves overtime
    /// cumulativeStable    tracks cumulative stable reserves overtime
    /// cumulativeLiquidity tracks cumulative liquidity factor overtime
    function reserves(bytes32 poolId)
        external
        view
        returns (
            uint128 reserveRisky,
            uint128 reserveStable,
            uint128 liquidity,
            uint128 float,
            uint128 debt,
            uint32 blockTimestamp,
            uint256 cumulativeRisky,
            uint256 cumulativeStable,
            uint256 cumulativeLiquidity
        );

    /// @notice Fetches Calibrated and initialized pool's parameters
    /// @param  poolId  Pool id to fetch the parameters of
    /// @return strike  Strike price of the pool
    /// sigma           Volatility of the pool
    /// maturity        Timestamp of maturity
    /// lastTimestamp   Last timestamp used to calculate time until expiry, "tau"
    function settings(bytes32 poolId)
        external
        view
        returns (
            uint128 strike,
            uint64 sigma,
            uint32 maturity,
            uint32 lastTimestamp
        );

    /// @notice Fetches Position data struct using a position id
    /// @param  posId   Position id
    /// @return float   Liquidity shares that are marked for loans
    /// liquidity       Liquidity shares in the position
    /// debt            Liquidity shares in debt, must be repaid, also equal to risky balance of position
    function positions(bytes32 posId)
        external
        view
        returns (
            uint128 float,
            uint128 liquidity,
            uint128 debt
        );

    /// @notice                 Fetchs the margin position of `owner`
    /// @param  owner           Margin account's owner
    /// @return balanceRisky    Balance of the risky token
    /// balanceStable           Balance of the stable token
    function margins(address owner) external view returns (uint128 balanceRisky, uint128 balanceStable);

    /// @param  strike      Strike price of the pool
    /// @param  sigma       Volatility of the pool, scaled by Mantissa of 1e4
    /// @param  maturity    Timestamp of Maturity
    /// @return             Keccak256 hash of the `calibration` parameters and Engine contract address
    function getPoolId(
        uint256 strike,
        uint64 sigma,
        uint32 maturity
    ) external view returns (bytes32);
}
