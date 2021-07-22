// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Lending Callbacks
/// @author Primitive

interface IPrimitiveLendingCallback {
    /// @notice Triggered when borrowing liquidity from an Engine
    /// @param  delLiquidity Amonut of liquidity being borrowed
    /// @param  delRisky     Amount of risky tokens required to initialize risky reserve
    /// @param  delStable    Amount of stable tokens required to initialize stable reserve
    /// @param  data         Calldata passed on borrow function call
    function borrowCallback(
        uint256 delLiquidity,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;

    /// @notice Triggered when repaying liquidity to an Engine
    /// @param  delStable    Amount of stable tokens required to re-mint liquidity to pay back
    /// @param  data         Calldata passed on repay function call
    function repayFromExternalCallback(uint256 delStable, bytes calldata data) external;
}
