// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Primitive Tier 2 Engine
 * @author  Primtive
 * @notice  Implements pricing curve for replicating Black-scholes priced covered calls.
 * @dev     Key functions are: calcInvariant, calcInput, calcOutput.
 */

import "../libraries/ReplicationMath.sol";

abstract contract Tier2Engine {
    using Units for *;
    using ABDKMath64x64 for *;

    /**
     * @notice  Calculates the Replication invariant: R2 - K * CDF(CDF^-1(1 - x) - sigma*sqrt(T-t))
     */
    function _calcInvariant(
        uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time
    ) internal pure returns (int128 invariant) {
        invariant = ReplicationMath.calcInvariant(RX1, RY2, liquidity, strike, sigma, time);
    }

    /**
     * @notice  Calculates the RY2 reserve, which is a function of RX1.
     */
    function _calcRY2(uint RX1, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RY2) {
        RY2 = ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }

    function _calcRX1(uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RX1) {
        RX1 = ReplicationMath.getInverseTradingFunction(RY2, liquidity, strike, sigma, time);
    }

    /**
     * @notice  Swap Y -> X. Calculates the amount of Y that must enter the pool to preserve the invariant.
     * @dev     X leaves the pool.
     */
    function _calcInput(uint deltaX, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaY) {
        RX1 = RX1 - deltaX;
        int128 preRY2 = RY2.parseUnits();
        int128 postRY2 = _calcRY2(RX1, liquidity, strike, sigma, time);
        deltaY = postRY2 > preRY2 ? postRY2.sub(preRY2) : preRY2.sub(postRY2);
    }

    /**
     * @notice  Swap X -> Y. Calculates the amount of Y that must leave the pool to preserve the invariant.
     * @dev     X enters the pool.
     */
    function _calcOutput(uint deltaX, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaY) {
        RX1 = RX1 + deltaX;
        int128 preRY2 = RY2.parseUnits();
        int128 postRY2 = _calcRY2(RX1, liquidity, strike, sigma, time);
        deltaY = postRY2 > preRY2 ? postRY2.sub(preRY2) : preRY2.sub(postRY2);
    }

    /**
     * @notice  Swap Y -> X. Calculates the amount of X that must leave the pool to preserve the invariant.
     * @dev     Y enters the pool. X leaves the pool.
     */
    function _calcRiskFreeInput(uint deltaY, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaX) {
        RY2 = RY2 + deltaY;
        int128 preRX1 = RX1.parseUnits();
        int128 postRX1 = _calcRX1(RX1, liquidity, strike, sigma, time);
        deltaX = postRX1 > preRX1 ? postRX1.sub(preRX1) : preRX1.sub(postRX1);
    }

    /**
     * @notice  Swap X -> Y. Calculates the amount of X that must enter the pool to preserve the invariant.
     * @dev     Y leaves the pool. X enters the pool.
     */
    function _calcRiskFreeOutput(uint deltaY, uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 deltaX) {
        RY2 = RY2 - deltaY;
        int128 preRX1 = RX1.parseUnits();
        int128 postRX1 = _calcRX1(RY2, liquidity, strike, sigma, time);
        deltaX = postRX1 > preRX1 ? postRX1.sub(preRX1) : preRX1.sub(postRX1);
    }

    function test() public virtual {}
}