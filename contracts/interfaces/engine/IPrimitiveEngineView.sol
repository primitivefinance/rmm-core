// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0;

/// @title  View functions of the Primitive Engine contract
/// @author Primitive
interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice             Fetches the current invariant based on risky and stable token reserves of pool with `poolId`
    /// @param  poolId      Pool Identifier
    /// @return invariant   Signed fixed point 64.64 number, invariant of `poolId`
    function invariantOf(bytes32 poolId) external view returns (int128 invariant);

    // ===== Constants =====

    /// @return Precision units to scale to when doing token related calculations
    function PRECISION() external view returns (uint256);

    /// @return Amount of seconds after pool expiry which allows swaps, no swaps after buffer
    function BUFFER() external view returns (uint256);

    // ===== Immutables =====

    /// @return Amount of liquidity burned on `create()` calls
    function MIN_LIQUIDITY() external view returns (uint256);

    //// @return Factory address which deployed this engine contract
    function factory() external view returns (address);

    //// @return Risky token address
    function risky() external view returns (address);

    /// @return Stable token address
    function stable() external view returns (address);

    /// @return Multiplier to scale amounts to/from, equal to 10^(18 - riskyDecimals)
    function scaleFactorRisky() external view returns (uint256);

    /// @return Multiplier to scale amounts to/from, equal to 10^(18 - stableDecimals)
    function scaleFactorStable() external view returns (uint256);

    // ===== Pool State =====

    /// @notice                      Fetches the global reserve state for a pool with `poolId`
    /// @param  poolId               Pool Identifier
    /// @return reserveRisky         Risky token balance in the reserve
    /// @return reserveStable        Stable token balance in the reserve
    /// @return liquidity            Total supply of liquidity for the curve
    /// @return blockTimestamp       Timestamp when the cumulative reserve values were last updated
    /// @return cumulativeRisky      Cumulative sum of risky token reserves of the previous update
    /// @return cumulativeStable     Cumulative sum of stable token reserves of the previous update
    /// @return cumulativeLiquidity  Cumulative sum of total supply of liquidity of the previous update
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

    /// @notice                 Fetches `Calibration` pool parameters
    /// @param  poolId          Pool Identifier
    /// @return strike          Strike price of the pool with stable token decimals
    /// @return sigma           Implied Volatility as an unsigned 32-bit integer constant w/ precision of 1e4, 10000 = 100%
    /// @return maturity        Timestamp of maturity in seconds
    /// @return lastTimestamp   Last timestamp used to calculate time until expiry, aka "tau"
    /// @return gamma           = 1 - fee %, as an unsigned 32-bit integer constant w/ precision of 1e4, 10000 = 100%
    function calibrations(bytes32 poolId)
        external
        view
        returns (
            uint128 strike,
            uint32 sigma,
            uint32 maturity,
            uint32 lastTimestamp,
            uint32 gamma
        );

    /// @notice             Fetches position liquidity an account address and poolId
    /// @param  poolId      Pool Identifier
    /// @return liquidity   Liquidity owned by `account` in `poolId`
    function liquidity(address account, bytes32 poolId) external view returns (uint256 liquidity);

    /// @notice                 Fetches the margin balances of `account`
    /// @param  account         Margin account to fetch
    /// @return balanceRisky    Balance of the risky token
    /// @return balanceStable   Balance of the stable token
    function margins(address account) external view returns (uint128 balanceRisky, uint128 balanceStable);
}
