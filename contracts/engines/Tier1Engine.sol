// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Primitive Tier 1 Engine
 * @author  Primtive
 * @notice  Implements pricing curve for trading short covered options and underlying tokens.
 */

import "../libraries/LogitMath.sol";

abstract contract Tier1Engine {
    function calculateInvariant(uint p, int slope, int translation) internal pure returns (int128 invariant) {
        invariant = LogitMath.calcInvariant(p, slope, translation);
    }

    /**
     * @notice  Swap Y -> X. Calculates the amount of Y that must enter the pool to preserve the invariant.
     * @dev     X leaves the pool.
     */
    function calculateInput(uint deltaX, uint RX1, uint RY2, uint liquidity, LogitMath.Params memory params) internal pure returns (int128 deltaY) {
        RX1 = RX1 - deltaX;
        deltaY = LogitMath.getTradingFunction(RX1, RY2, liquidity, params);
    }

    /**
     * @notice  Swap X -> Y. Calculates the amount of Y that must leave the pool to preserve the invariant.
     * @dev     X enters the pool.
     */
    function calculateOutput(uint deltaX, uint RX1, uint RY2, uint liquidity, LogitMath.Params memory params) internal pure returns (int128 deltaY) {
        RX1 = RX1 + deltaX;
        deltaY = LogitMath.getTradingFunction(RX1, RY2, liquidity, params);
    }
}