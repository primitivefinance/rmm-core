// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Repay Callback
/// @author Primitive

interface IPrimitiveRepayCallback {
    /// @notice                 Triggered when repaying liquidity to an Engine
    /// @param  riskyDeficit    Amount of risky tokens requested to Engine
    /// @param  stableDeficit   Amount of stable tokens requested to Engine
    /// @param  data            Calldata passed on repay function call
    function repayCallback(
        uint256 riskyDeficit,
        uint256 stableDeficit,
        bytes calldata data
    ) external;
}
