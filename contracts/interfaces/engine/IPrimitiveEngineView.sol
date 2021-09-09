// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  View functions of the Primitive Engine contract
/// @author Primitive
interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice             Fetches the current invariant based on risky and stable token reserves of pool with `poolId`
    /// @param  poolId      Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @return invariant   Signed fixed point 64.64 number, invariant of `poolId`
    function invariantOf(bytes32 poolId) external view returns (int128 invariant);

    // ===== Immutables =====

    /// @return Precision units to scale to when doing calculations
    function PRECISION() external view returns (uint256);

    //// @return Factory address which deployed this engine contract
    function factory() external view returns (address);

    //// @return Risky token address
    function risky() external view returns (address);

    /// @return Stable token address
    function stable() external view returns (address);

    /// @return Precision multiplier to scale amounts to/from, 10^(18 - riskyDecimals)
    function precisionRisky() external view returns (uint256);

    /// @return Precision multiplier to scale amounts to/from, 10^(18 - riskyDecimals)
    function precisionStable() external view returns (uint256);

    // ===== Pool State =====

    /// @notice             Fetches the global reserve state for a pool with `poolId`
    /// @param  poolId       Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @return reserveRisky Risky token balance in the reserve
    /// reserveStable       Stable token balance in the reserve
    /// liquidity           Total supply of liquidity for the curve
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

    /// @notice             Fetches position liquidity an account address and poolId
    /// @param  poolId      Keccak256 hash of pool parameters
    /// @return liquidity   Liquidity owned by `account` in `poolId`
    function liquidity(address account, bytes32 poolId) external view returns (uint256 liquidity);

    /// @notice                 Fetchs the margin position of `account`
    /// @param  account         Margin account to fetch
    /// @return balanceRisky    Balance of the risky token
    /// balanceStable           Balance of the stable token
    function margins(address account) external view returns (uint128 balanceRisky, uint128 balanceStable);
}
