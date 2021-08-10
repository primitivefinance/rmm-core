// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Repay Callback
/// @author Primitive

interface IPrimitiveRepayCallback {
    /// @notice Triggered when repaying liquidity to an Engine
    /// @param  delStable    Amount of stable tokens required to re-mint liquidity to pay back
    /// @param  data         Calldata passed on repay function call
    function repayCallback(uint256 delStable, bytes calldata data) external;
}
