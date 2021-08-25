// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Repay Callback
/// @author Primitive

interface IPrimitiveRepayCallback {
    /// @notice                 Triggered when repaying liquidity to an Engine
    /// @param  riskyDeficit    Amount of risky tokens requested (positive) to Engine, or paid (negative) to user
    /// @param  stableDeficit   Amount of stable tokens requested (positive) to Engine, or paid (negative) to user
    /// @param  data            Calldata passed on repay function call
    function repayCallback(
        int256 riskyDeficit,
        int256 stableDeficit,
        bytes calldata data
    ) external;
}
