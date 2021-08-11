// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   Test Get Stable Given Risky
/// @author  Primitive
/// @dev     Tests each step in ReplicationMath.getStableGivenRisky. For testing ONLY

contract TestGetStableGivenRisky {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    function step0(uint256 strike) public pure returns (int128 K) {
        K = strike.parseUnits();
    }

    function step1(uint256 sigma, uint256 tau) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, tau);
    }

    function step2(uint256 reserveRisky) public pure returns (int128 reserve) {
        reserve = reserveRisky.parseUnits();
    }

    function step3(int128 reserve) public pure returns (int128 phi) {
        phi = ReplicationMath.ONE_INT.sub(reserve).getInverseCDF(); // CDF^-1(1-x)
    }

    function step4(int128 phi, int128 vol) public pure returns (int128 input) {
        input = phi.sub(vol); // phi - vol
    }

    function step5(
        int128 K,
        int128 input,
        int128 invariantLast
    ) public pure returns (int128 reserveStable) {
        reserveStable = K.mul(input.getCDF()).add(invariantLast);
    }

    /// @return reserveStable The calculated stable reserve, using the risky reserve
    function getStableGivenRisky(
        int128 invariantLast,
        uint256 reserveRisky,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public pure returns (int128 reserveStable) {
        int128 K = step0(strike);
        int128 vol = step1(sigma, tau);
        int128 reserve = step2(reserveRisky);
        int128 phi = step3(reserve);
        int128 input = step4(phi, vol);
        reserveStable = step5(K, input, invariantLast);
    }
}
