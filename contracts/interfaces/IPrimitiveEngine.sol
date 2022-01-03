// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.4;

import "./engine/IPrimitiveEngineActions.sol";
import "./engine/IPrimitiveEngineEvents.sol";
import "./engine/IPrimitiveEngineView.sol";
import "./engine/IPrimitiveEngineErrors.sol";

/// @title Primitive Engine Interface
interface IPrimitiveEngine is
    IPrimitiveEngineActions,
    IPrimitiveEngineEvents,
    IPrimitiveEngineView,
    IPrimitiveEngineErrors
{

}
