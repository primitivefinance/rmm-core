// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  View functions of the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineView {
    // ===== View =====
    /// @notice             Fetches expected stable token reserves using risky reserve balance
    /// @param  poolId      Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @param  reserveRisky Current reserve of risky tokens
    /// @return reserveStable Expected stable token reserve
    function getStableGivenRisky(bytes32 poolId, uint256 reserveRisky) external view returns (int128 reserveStable);

    /// @notice             Fetches expected risky token reserves using stable reserve balance
    /// @param  poolId      Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @param  reserveStable Current reserve of stable tokens
    /// @return reserveRisky Expected risky token reserve
    function getRiskyGivenStable(bytes32 poolId, uint256 reserveStable) external view returns (int128 reserveRisky);

    /// @notice             Fetches the current invariant based on risky and stable token reserves of pool with `poolId`
    /// @param  poolId      Pool id to get the invariant of
    /// @return invariant   Invariant of `poolId`
    function invariantOf(bytes32 poolId) external view returns (int128 invariant);

    // ===== Immutables =====
    //// Factory address which deployed this engine contract
    function factory() external view returns (address);

    //// Risky token address
    function risky() external view returns (address);

    /// Stable token address
    function stable() external view returns (address);

    // ===== Pool State =====
    /// @notice             Fetches the global reserve state for a pool with `poolId`
    /// @param poolId       Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @return             reserveRisky Risky token balance in the reserve
    /// reserveStable       Stable token balance in the reserve
    /// liquidity           Total supply of liquidity for the curve
    /// float               Total supply of liquidity supplied to be borrowed
    /// debt                Total supply of liquidity borrowed
    /// feeRisky
    /// feeStable
    /// blockTimestamp      Timestamp when the cumulative reserve values were last updated
    /// cumulativeRisky     Cumulative sum of risky token reserves
    /// cumulativeStable    Cumulative sum of stable token reserves
    /// cumulativeLiquidity Cumulative sum of total supply of liquidity
    function reserves(bytes32 poolId)
        external
        view
        returns (
            uint128 reserveRisky,
            uint128 reserveStable,
            uint128 liquidity,
            uint128 float,
            uint128 debt,
            uint128 feeRisky,
            uint128 feeStable,
            uint32 blockTimestamp,
            uint256 cumulativeRisky,
            uint256 cumulativeStable,
            uint256 cumulativeLiquidity
        );

    /// @notice             Fetches `Calibration` pool parameters
    /// @param  poolId      Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @return strike      Strike price of the pool
    /// sigma               Volatility of the pool
    /// maturity            Timestamp of maturity
    /// lastTimestamp       Last timestamp used to calculate time until expiry, aka "tau"
    function calibrations(bytes32 poolId)
        external
        view
        returns (
            uint128 strike,
            uint64 sigma,
            uint32 maturity,
            uint32 lastTimestamp
        );

    /// @notice             Fetches Position data struct using a position id
    /// @param  posId       Keccak256 hash of owner address and poolId
    /// @return float       Liquidity that is supplied to be borrowed
    /// liquidity           Liquidity in the position
    /// riskyCollateral     For every 1 risky collateral, 1 liquidity debt
    /// stableCollateral    For every K stable collateral (K = strike), 1 liquidity debt
    function positions(bytes32 posId)
        external
        view
        returns (
            uint128 float,
            uint128 liquidity,
            uint128 riskyCollateral,
            uint128 stableCollateral
        );

    /// @notice                 Fetchs the margin position of `account`
    /// @param  account         Margin account to fetch
    /// @return balanceRisky    Balance of the risky token
    /// balanceStable           Balance of the stable token
    function margins(address account) external view returns (uint128 balanceRisky, uint128 balanceStable);
}
