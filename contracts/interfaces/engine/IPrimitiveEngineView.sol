// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The view functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice Computes the reserve value of `token` using the known `reserve` value of the other token
    /// @param  pid The hashed pool Id
    /// @param  token The reserve of the token to compute
    /// @param  reserve The reserve of the other token, which is known
    /// @return reserveOfToken The reserve of the `token`
    function compute(bytes32 pid, address token, uint reserve) external view returns (int128 reserveOfToken);
    
    /// @notice Uses the trading function to calculate an invariant using risky and stable token reserve values
    /// @param  pid The hashed pool Id
    /// @param  postR1 The amount of risky tokens in the pool's reserves
    /// @param  postR2 The amount of stable tokens in the pool's reserves
    /// @param  postLiquidity The total supply of liquidity shares for the pool
    /// @return The invariant calculated (which should be near 0)
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);

    /// @notice Fetches the current invariant based on risky and stable token reserves of pool with `pid`
    /// @param  pid The pool id to get the invariant of
    /// @return invariant
    function invariantOf(bytes32 pid) external view returns (int128);

    // ===== Immutables =====
    //// @return The factory address which deployed this engine contract
    function factory() external view returns (address);

    //// @return The risky token address
    function risky() external view returns (address);

    /// @return The stable token address
    function stable() external view returns (address);

    /// @return The fee charged on the way in, for swaps and flashes
    function fee() external view returns (uint);

    // ===== Pool States =====
    /// @notice Fetches the global reserve state for a pool with `pid`
    /// @param  pid The pool id hash
    /// @return RX1 risky balance
    /// @return RY2 risk free balance
    /// @return liquidity total liquidity shares
    /// @return float liquidity shares available to be borrowed 
    /// @return debt total borrow liquidity shares
    /// @return cumulativeRisky tracks cumulative risky reserves overtime
    /// @return cumulativeStable tracks cumulative stable reserves overtime
    /// @return cumulativeLiquidity tracks cumulative liquidity factor overtime
    /// @return blockTimestamp unix timestamp when the cumulative reserve values were last updated
    function reserves(bytes32 pid) external view returns (
        uint RX1, uint RY2, uint liquidity, uint float, uint debt, uint cumulativeRisky,
        uint cumulativeStable,
        uint cumulativeLiquidity,
        uint32 blockTimestamp
        );

    /// @notice Fetches the calibrated and initialized pool's parameters
    /// @param  pid The pool id to fetch the parameters of
    /// @return strike  The strike price of the pool
    /// @return  sigma   The volatility of the pool
    /// @return  time    The time until expiry of the pool
    function settings(bytes32 pid) external view returns (uint strike, uint sigma, uint time);

    /// @notice Fetches The position data struct using a position id
    /// @param  posId   The position id
    /// @return owner   the address that owns the position
    /// @return pid     The pool id hash
    /// @return balanceX The risky balance of the position debt
    /// @return balanceY The stable balance of the position debt
    /// @return liquidity The liquidity shares in the position
    /// @return float   The liquidity shares that are marked for loans
    /// @return debt    The position debt denominated in liquidity shares
    function positions(bytes32 posId) external view returns (
        address owner, bytes32 pid, uint balanceX, uint balanceY, uint liquidity, uint float, uint debt
    );

    /// @notice Fetchs the margin position of `owner`
    /// @param  owner   The margin account's owner
    /// @return BX1     The balance of the risky token
    /// @return BY2     The balance of the stable token
    /// @return unlocked If the margin position is unlocked, only during execution is it locked.
    function margins(address owner) external view returns (uint BX1, uint BY2, bool unlocked);

    /// @param  strike  The strike price of the pool
    /// @param  sigma   The volatility of the pool
    /// @param  time    The time until expiry of the pool
    /// @return The keccak256 hash of the `calibration` parameters
    function getPoolId(uint strike, uint sigma, uint time) external view returns(bytes32);

    /// @return len The length of the all pool ids array
    function getAllPoolsLength() external view returns (uint len);
}
