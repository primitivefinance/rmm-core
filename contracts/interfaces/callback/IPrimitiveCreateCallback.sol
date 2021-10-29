// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0;

/// @title  Primitive Create Callback
/// @author Primitive
interface IPrimitiveCreateCallback {
    /// @notice              Triggered when creating a new pool for an Engine
    /// @param  delRisky     Amount of risky tokens required to initialize risky reserve
    /// @param  delStable    Amount of stable tokens required to initialize stable reserve
    /// @param  data         Calldata passed on create function call
    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;
}
