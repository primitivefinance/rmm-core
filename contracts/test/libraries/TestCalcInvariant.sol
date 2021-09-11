// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   ReplicationMath Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestCalcInvariant {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    uint256 public precisionRisky;
    uint256 public precisionStable;

    function set(uint256 prec0, uint256 prec1) public {
        precisionRisky = prec0;
        precisionStable = prec1;
    }

    function step0(
        uint256 reserveRisky,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserve2) {
        reserve2 = ReplicationMath
        .getStableGivenRisky(0, precisionRisky, precisionStable, reserveRisky, 1e18, strike, sigma, tau)
        .scaleToX64(precisionStable);
    }

    function step1(uint256 reserveStable, int128 reserve2) public view returns (int128 invariant) {
        invariant = reserveStable.scaleToX64(precisionStable).sub(reserve2);
    }

    /// @return invariant Uses the trading function to calculate the invariant, which starts at 0 and grows with fees
    function calcInvariant(
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 invariant) {
        int128 reserve2 = step0(reserveRisky, strike, sigma, tau);
        invariant = step1(reserveStable, reserve2);
    }
}
