// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/ReplicationMath.sol";

/// @title   Test Trading Function
/// @author  Primitive
/// @dev     Tests each step in ReplicationMath.getTradingFunction. For testing ONLY

contract TestTradingFunction {
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

    function step3(int128 reserve) public view returns (int128 phi) {
        phi = uint256(1).fromUInt().sub(reserve).getInverseCDF(); // CDF^-1(1-x)
    }

    function step4(int128 phi, int128 vol) public view returns (int128 input) {
        input = phi.mul(Units.PERCENTAGE_INT).sub(vol).div(Units.PERCENTAGE_INT); // phi - vol
    }

    function step5(
        int128 K,
        int128 input,
        int128 invariantLast,
        uint256 liquidity
    ) public view returns (int128 reserveStable) {
        reserveStable = K.mul(input.getCDF()).add(invariantLast).mul(liquidity.parseUnits());
    }

    /// @return reserveStable The calculated stable reserve, using the risky reserve
    function getTradingFunction(
        int128 invariantLast,
        uint256 reserveRisky,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserveStable) {
        int128 K = step0(strike);
        int128 vol = step1(sigma, tau);
        int128 reserve = step2(reserveRisky, liquidity);
        int128 phi = step3(reserve);
        int128 input = step4(phi, vol);
        reserveStable = step5(K, input, invariantLast, liquidity);
    }
}
