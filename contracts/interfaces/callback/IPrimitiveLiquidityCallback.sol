// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0;

/// @title  Primitive Liquidity Callback
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
}
