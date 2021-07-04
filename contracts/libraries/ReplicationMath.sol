// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Replication Math
/// @author  Primitive

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

    /// @return  vol Implied Vol * Sqrt(T-t)
    function getProportionalVolatility(uint256 sigma, uint256 tau) internal pure returns (int128 vol) {
        // sigma * sqrt(t)
        int128 sqrtTime = tau.toYears().sqrt();
        int128 SX1 = sigma.fromUInt();
        vol = SX1.mul(sqrtTime);
    }

    /// @notice  Fetches reserveStable using reserveRisky.
    /// @return  reserveStable = K * CDF(CDF^-1(1 - reserveRisky) - sigma * sqrt(T - t))
    function getTradingFunction(
        uint256 reserveRisky,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 reserveStable) {
        int128 k = strike.parseUnits();
        // sigma*sqrt(t)
        int128 vol = getProportionalVolatility(sigma, tau);
        int128 one = uint256(1).fromUInt();
        // CDF
        int128 reserve = ((reserveRisky * 10**18) / liquidity).parseUnits();
        int128 phi = one.sub(reserve).getInverseCDF();
        // CDF^-1(1-x) - sigma*sqrt(t)
        int128 input = phi.mul(Units.PERCENTAGE_INT).sub(vol).div(Units.PERCENTAGE_INT);
        // K * CDF(CDF^-1(1 - reserveRisky) - sigma * sqrt(T - t))
        reserveStable = k.mul(input.getCDF()).mul(liquidity.parseUnits());
    }

    /// @notice  Fetches reserveRisky using reserveStable.
    /// @return  reserveRisky = 1 - K*CDF(CDF^-1(reserveStable/K) + sigma*sqrt(t))
    function getInverseTradingFunction(
        uint256 reserveStable,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 reserveRisky) {
        int128 k = strike.parseUnits();
        // sigma*sqrt(t)
        int128 vol = getProportionalVolatility(sigma, tau);
        // 1
        int128 one = uint256(1).fromUInt();
        // Y
        int128 reserve = ((reserveStable * 10**18) / liquidity).parseUnits();
        // CDF^-1(Y/K)
        int128 phi = reserve.div(k).getInverseCDF();
        // CDF^-1(Y/K) + sigma*sqrt(t)
        int128 input = phi.mul(Units.PERCENTAGE_INT).add(vol).div(Units.PERCENTAGE_INT);
        // 1 - K*CDF(CDF^-1(Y/K) + sigma*sqrt(t))
        reserveRisky = one.sub(input.getCDF()).mul(liquidity.parseUnits());
    }

    /// @return  reserveStable - K * CDF(CDF^-1(1 - reserveRisky) - sigma * sqrt(T - t))
    function calcInvariant(
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128) {
        int128 reserve2 = getTradingFunction(reserveRisky, liquidity, strike, sigma, tau);
        int128 invariant = reserveStable.parseUnits().sub(reserve2);
        return invariant;
    }
}
