// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Margin Callback
/// @author Primitive

interface IPrimitiveMarginCallback {
    /// @notice Triggered when depositing tokens to an Engine
    /// @param  delRisky     Amount of risky tokens required to deposit to risky margin balance
    /// @param  delStable    Amount of stable tokens required to deposit to stable margin balance
    /// @param  data         Calldata passed on deposit function call
    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;
}
