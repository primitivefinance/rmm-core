// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Primitive Liquidity Callbacks
/// @author Primitive

interface IPrimitiveLiquidityCallback {
    /// @notice              Triggered when providing liquidity to an Engine
    /// @param  delRisky     Amount of risky tokens required to provide to risky reserve
    /// @param  delStable    Amount of stable tokens required to provide to stable reserve
    /// @param  data         Calldata passed on allocate function call
    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;

    /// @notice              Triggered when removing liquidity from an Engine
    /// @param  delRisky     Amount of risky tokens being removed from risky reserve
    /// @param  delStable    Amount of stable tokens being removed from stable reserve
    /// @param  data         Calldata passed on remove function call
    function removeCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;
}
