// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Primitive Tier 2 Engine
 * @author  Primtive
 * @notice  Implements pricing curve for replicating Black-scholes priced covered calls.
 * @dev     Key functions are: calcInvariant, calcInput, calcOutput.
 */

import "../libraries/ReplicationMath.sol";
import "../libraries/Units.sol";

asbtract contract Tier2Engine {
    using Units for int128;

    /**
     * @notice  Calculates the Replication invariant: R2 - K * CDF(CDF^-1(1 - x) - sigma*sqrt(T-t))
     */
    function calcInvariant(
        uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time
    ) internal pure returns (int128 invariant) {
        invariant = ReplicationMath.calcInvariant(RX1, RY2, liquidity, strike, sigma, time);
    }

    /**
     * @notice  Calculates the RY2 reserve, which is a function of RX1.
     */
    function calcRY2(uint RX1, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RY2) {
        RY2 = ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }

    /**
     * @notice  Swap Y -> X. Calculates the amount of Y that must enter the pool to preserve the invariant.
     * @dev     X leaves the pool.
     */
    function calcInput(uint deltaX, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaY) {
        RX1 = RX1 - deltaX;
        uint postRY2 = calcRY2(RX1, liquidity, strike, sigma, time).fromInt() * 1e18 / Units.MANTISSA;
        deltaY = postRY2 > RY2 ? postRY2 - RY2 : RY2 - postRY2;
    }

    /**
     * @notice  Swap X -> Y. Calculates the amount of Y that must leave the pool to preserve the invariant.
     * @dev     X enters the pool.
     */
    function calcOutput(uint deltaX, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaY) {
        RX1 = RX1 + deltaX;
        uint postRY2 = calcRY2(RX1, liquidity, strike, sigma, time).fromInt() * 1e18 / Units.MANTISSA;
        deltaY = postRY2 > RY2 ? postRY2 - RY2 : RY2 - postRY2;
    }
}