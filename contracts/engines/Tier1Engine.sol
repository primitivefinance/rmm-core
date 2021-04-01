// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Primitive Tier 1 Engine
 * @author  Primtive
 * @notice  Implements pricing curve for trading short covered options and underlying tokens.
 */

import "../libraries/LogitMath.sol";

abstract contract Tier1Engine {
    function calculateInvariant() internal pure returns (int128) {}

    function calculateInput() internal pure returns (int128) {}

    function calculateOutput() internal pure returns (int128) {}
}