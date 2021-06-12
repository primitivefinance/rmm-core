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
    function compute(bytes32 pid, address token, uint reserve) external view returns (int128 reserveOfToken);
    
    /// @notice                 Uses the trading function to calc the invariant using token reserve values
    /// @param  pid             The hashed pool Id
    /// @param  postR1          The amount of risky tokens in the pool's reserves
    /// @param  postR2          The amount of stable tokens in the pool's reserves
    /// @param  postLiquidity   The total supply of liquidity shares for the pool
    /// @return                 The invariant calculated (which should be near 0)
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);

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

    /// The fee charged on the way in, for swaps and flashes
    function fee() external view returns (uint);

    // ===== Pool States =====
    /// @notice             Fetches the global reserve state for a pool with `pid`
    /// @param              pid The pool id hash
    /// @return             RX1 risky balance
    /// RY2                 risk free balance
    /// liquidity           total liquidity shares
    /// float               liquidity shares available to be borrowed 
    /// debt                total borrow liquidity shares
    /// cumulativeRisky     tracks cumulative risky reserves overtime
    /// cumulativeStable    tracks cumulative stable reserves overtime
    /// cumulativeLiquidity tracks cumulative liquidity factor overtime
    /// blockTimestamp      unix timestamp when the cumulative reserve values were last updated
    function reserves(bytes32 pid) external view returns (
        uint RX1, uint RY2, uint liquidity, uint float, uint debt, uint cumulativeRisky,
        uint cumulativeStable,
        uint cumulativeLiquidity,
        uint32 blockTimestamp
        );

    /// @notice Fetches The calibrated and initialized pool's parameters
    /// @param  pid     The pool id to fetch the parameters of
    /// @return strike  The strike price of the pool
    /// sigma           The volatility of the pool
    /// time            The time until expiry of the pool
    function settings(bytes32 pid) external view returns (uint128 strike, uint64 sigma, uint64 time);

    /// @notice Fetches The position data struct using a position id
    /// @param  posId   The position id
    /// @return balanceRisky    The risky balance of the position debt
    /// balanceStable   The stable balance of the position debt
    /// float           The liquidity shares that are marked for loans
    /// liquidity       The liquidity shares in the position
    /// debt            The liquidity shares in debt, must be repaid
    function positions(bytes32 posId) external view returns (
        uint128 balanceRisky, uint128 balanceStable, uint128 float, uint128 liquidity, uint128 debt
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
    function getPoolId(uint strike, uint sigma, uint time) external view returns(bytes32);
}
