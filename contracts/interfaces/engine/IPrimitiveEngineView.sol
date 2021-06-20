// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The view functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice         Computes the reserve value of `token` using the known `reserve` value of the other token
    /// @param  pid     The hashed pool Id
    /// @param  token   The reserve of the token to compute
    /// @param  reserve The reserve of the other token, which is known
    /// @return reserveOfToken  The reserve of the `token`
    function compute(
        bytes32 pid,
        address token,
        uint256 reserve
    ) external view returns (int128 reserveOfToken);

    /// @notice                 Uses the trading function to calc the invariant using token reserve values
    /// @param  pid             The hashed pool Id
    /// @param  postR1          The amount of risky tokens in the pool's reserves
    /// @param  postR2          The amount of stable tokens in the pool's reserves
    /// @param  postLiquidity   The total supply of liquidity shares for the pool
    /// @return                 The invariant calculated (which should be near 0)
    function calcInvariant(
        bytes32 pid,
        uint256 postR1,
        uint256 postR2,
        uint256 postLiquidity
    ) external view returns (int128);

    /// @notice Fetches the current invariant based on risky and stable token reserves of pool with `pid`
    /// @param  pid The pool id to get the invariant of
    /// invariant
    function invariantOf(bytes32 pid) external view returns (int128);

    // ===== Immutables =====
    //// The factory address which deployed this engine contract
    function factory() external view returns (address);

    //// The risky token address
    function risky() external view returns (address);

    /// The stable token address
    function stable() external view returns (address);

    // ===== Pool States =====
    /// @notice             Fetches the global reserve state for a pool with `pid`
    /// @param              pid The pool id hash
    /// @return             reserveRisky risky balance
    /// reserveStable       risk free balance
    /// liquidity           total liquidity shares
    /// float               liquidity shares available to be borrowed
    /// debt                total borrow liquidity shares
    /// blockTimestamp      unix timestamp when the cumulative reserve values were last updated
    /// cumulativeRisky     tracks cumulative risky reserves overtime
    /// cumulativeStable    tracks cumulative stable reserves overtime
    /// cumulativeLiquidity tracks cumulative liquidity factor overtime
    function reserves(bytes32 pid)
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
    /// @param  pid     Pool id to fetch the parameters of
    /// @return strike  Strike price of the pool
    /// sigma           Volatility of the pool
    /// time            Time until expiry of the pool
    /// blockTimestamp  Timestamp on pool creation
    function settings(bytes32 pid)
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
    /// @param  owner           The margin account's owner
    /// @return balanceRisky    The balance of the risky token
    /// balanceStable           The balance of the stable token
    function margins(address owner) external view returns (uint128 balanceRisky, uint128 balanceStable);

    /// @param  strike  The strike price of the pool
    /// @param  sigma   The volatility of the pool
    /// @param  time    The time until expiry of the pool
    /// @return The keccak256 hash of the `calibration` parameters
    function getPoolId(
        uint256 strike,
        uint64 sigma,
        uint32 time
    ) external view returns (bytes32);
}
