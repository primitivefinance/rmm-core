// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   Test Trading Function
/// @author  Primitive
/// @dev     Tests each step in ReplicationMath.getInverseTradingFunction. For testing ONLY

contract TestInverseTradingFunction {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    function step0(uint256 strike) public view returns (int128 K) {
        K = strike.parseUnits();
    }

    function step1(uint256 sigma, uint256 tau) public view returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, tau);
    }

    function step2(uint256 reserveRisky, uint256 liquidity) public view returns (int128 reserve) {
        reserve = ((reserveRisky * 1e18) / liquidity).parseUnits();
    }

    function step3(
        int128 reserve,
        int128 invariantLast,
        int128 K
    ) public view returns (int128 phi) {
        phi = reserve.sub(invariantLast).div(K).getInverseCDF(); // CDF^-1((reserveStable - invariantLast)/K)
    }

    function step4(int128 phi, int128 vol) public view returns (int128 input) {
        input = phi.mul(Units.PERCENTAGE_INT).add(vol).div(Units.PERCENTAGE_INT); // phi + vol
    }

    function step5(int128 input, uint256 liquidity) public view returns (int128 reserveRisky) {
        reserveRisky = uint256(1).fromUInt().sub(input.getCDF()).mul(liquidity.parseUnits());
    }

    /// @return reserveRisky The calculated risky reserve, using the stable reserve
    function getInverseTradingFunction(
        int128 invariantLast,
        uint256 reserveStable,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserveRisky) {
        int128 K = step0(strike);
        int128 vol = step1(sigma, tau);
        int128 reserve = step2(reserveStable, liquidity);
        int128 phi = step3(reserve, invariantLast, K);
        int128 input = step4(phi, vol);
        reserveRisky = step5(input, liquidity);
    }
}
