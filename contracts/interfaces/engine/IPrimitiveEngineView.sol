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

    //// @return factory address which deployed this engine contract
    function factory() external view returns (address);

    //// @return risky token address
    function risky() external view returns (address);

    /// @return stable token address
    function stable() external view returns (address);

    /// @return 10**decimalsOfRisky, precision to scale to/from
    function precisionRisky() external view returns (uint256);

    /// @return 10**decimalsOfStable, precision to scale to/from
    function precisionStable() external view returns (uint256);

    // ===== Pool State =====

    /// @notice             Fetches the global reserve state for a pool with `poolId`
    /// @param  poolId       Keccak256 hash of engine, strike price, volatility, and maturity timestamp
    /// @return reserveRisky Risky token balance in the reserve
    /// reserveStable       Stable token balance in the reserve
    /// liquidity           Total supply of liquidity for the curve
    /// float               Total supply of liquidity supplied to be borrowed
    /// collateralRisky     Total risky tokens stored as collateral per 1 liquidity debt
    /// collateralStable    Total stable tokens stored as collateral, for K stable per 1 liquidity debt
    /// blockTimestamp      Timestamp when the cumulative reserve values were last updated
    /// feeRiskyGrowth      All time risky fees accumulated per float
    /// feeStableGrowth     All time stable fees accumulated per float
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
            uint128 collateralRisky,
            uint128 collateralStable,
            uint32 blockTimestamp,
            uint256 feeRiskyGrowth,
            uint256 feeStableGrowth,
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
    /// collateralRisky     For every 1 risky collateral, 1 liquidity debt
    /// collateralStable    For every K stable collateral (K = strike), 1 liquidity debt
    /// feeRiskyGrowthLast  All time risky fees accumulated per float of the position
    /// feeStableGrowthLast All time stable fees accumulated per float of the position
    function positions(bytes32 posId)
        external
        view
        returns (
            uint128 float,
            uint128 liquidity,
            uint128 collateralRisky,
            uint128 collateralStable,
            uint256 feeRiskyGrowthLast,
            uint256 feeStableGrowthLast
        );

    /// @notice                 Fetchs the margin position of `account`
    /// @param  account         Margin account to fetch
    /// @return balanceRisky    Balance of the risky token
    /// balanceStable           Balance of the stable token
    function margins(address account) external view returns (uint128 balanceRisky, uint128 balanceStable);
}
