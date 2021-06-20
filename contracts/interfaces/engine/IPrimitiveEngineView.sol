// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The view functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice         Computes the reserve value of `token` using the known `reserve` value of the other token
    /// @param  poolId  Keccak256 hash of strike price, volatility, and maturity timestamp
    /// @param  token   Reserve of the token to compute
    /// @param  reserve Reserve of the other token, which is known
    /// @return reserveOfToken  Reserve of the `token`
    function compute(
        bytes32 poolId,
        address token,
        uint256 reserve
    ) external view returns (int128 reserveOfToken);

    /// @notice                 Uses the trading function to calc the invariant using token reserve values
    /// @param  poolId             The hashed pool Id
    /// @param  postR1          Amount of risky tokens in the pool's reserves
    /// @param  postR2          Amount of stable tokens in the pool's reserves
    /// @param  postLiquidity   Total supply of liquidity shares for the pool
    /// @return                 Invariant calculated (which should be near 0)
    function calcInvariant(
        bytes32 poolId,
        uint256 postR1,
        uint256 postR2,
        uint256 postLiquidity
    ) external view returns (int128);

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
    /// time            Time until expiry of the pool
    /// blockTimestamp  Timestamp on pool creation
    function settings(bytes32 poolId)
        external
        view
        returns (
            uint128 strike,
            uint64 sigma,
            uint32 time,
            uint32 blockTimestamp
        );

    /// @notice Fetches Position data struct using a position id
    /// @param  posId   Position id
    /// @return balanceRisky    Risky balance of the position debt
    /// balanceStable   Stable balance of the position debt
    /// float           Liquidity shares that are marked for loans
    /// liquidity       Liquidity shares in the position
    /// debt            Liquidity shares in debt, must be repaid
    function positions(bytes32 posId)
        external
        view
        returns (
            uint128 balanceRisky,
            uint128 balanceStable,
            uint128 float,
            uint128 liquidity,
            uint128 debt
        );

    /// @notice                 Fetchs the margin position of `owner`
    /// @param  owner           Margin account's owner
    /// @return balanceRisky    Balance of the risky token
    /// balanceStable           Balance of the stable token
    function margins(address owner) external view returns (uint128 balanceRisky, uint128 balanceStable);

    /// @param  strike  Strike price of the pool
    /// @param  sigma   Volatility of the pool
    /// @param  time    Time until expiry of the pool
    /// @return         Keccak256 hash of the `calibration` parameters and Engine contract address
    function getPoolId(
        uint256 strike,
        uint64 sigma,
        uint32 time
    ) external view returns (bytes32);
}
