// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Replication Math
 * @author  Primitive
 */

import "./ABDKMath64x64.sol";
import "./BlackScholes.sol";
import "./CumulativeNormalDistribution.sol";
import "./Units.sol";


import "hardhat/console.sol";

library ReplicationMath {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using BlackScholes for int128;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    // ===== Math ======

    /**
     * @return  vol Implied Vol * Sqrt(T-t)
     */
    function getProportionalVolatility(uint sigma, uint time) internal pure returns (int128 vol) {
        // sigma * sqrt(t)
        int128 sqrtTime = time.toYears().sqrt();
        int128 SX1 = sigma.fromUInt();
        vol = SX1.mul(sqrtTime);
    }

    /**
     * @notice  Fetches RY2 using RX1.
     * @return  RY2 = K * CDF(CDF^-1(1 - RX1) - sigma * sqrt(T - t))
     */
    function getTradingFunction(uint RX1, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RY2) {
        int128 k = strike.parseUnits();
        // sigma*sqrt(t)
        int128 vol = getProportionalVolatility(sigma, time);
        int128 one = uint(1).fromUInt();
        // CDF
        int128 reserve = ((RX1 * 10 ** 18) / liquidity).parseUnits();
        int128 phi = one.sub(reserve).getInverseCDF();
        // CDF^-1(1-x) - sigma*sqrt(t)
        int128 input = phi.mul(Units.PERCENTAGE_INT).sub(vol).div(Units.PERCENTAGE_INT);
        // K * CDF(CDF^-1(1 - RX1) - sigma * sqrt(T - t))
        RY2 = k.mul(input.getCDF()).mul(liquidity.parseUnits()); 
    }

    /**
     * @return  RY2 - K * CDF(CDF^-1(1 - RX1) - sigma * sqrt(T - t))
     */
    function calcInvariant(uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128) {
        int128 reserve2 = getTradingFunction(RX1, liquidity, strike, sigma, time);
        int128 invariant = RY2.parseUnits().sub(reserve2);
        return invariant;
    }

    function getPerpetualPutTradingFunction(uint RX1, uint liquidity, uint strike, uint sigma, uint rfRate) internal pure returns (int128 RY2) {
        int128 k = strike.parseUnits();
        int128 r = rfRate.percentage();
        // 2r / (2r + sigma^2)
        int128 exponent = r.mul(2).div(r.mul(2).add(sigma.pow(2)));
        int128 input = RX1.pow(exponent.parseUnits());
        // RY2 = K - K * RX1^(2r / (2r + sigma^2))
        RY2 = k.sub(k.mul(input));
    }

    function calcPerpInvariant(uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint rfRate) internal pure returns (int128) {
        int128 reserve2 = getPerpetualPutTradingFunction(RX1, liquidity, strike, sigma, rfRate);
        int128 invariant = RY2.parseUnits().sub(reserve2);
        return invariant;
    }
}