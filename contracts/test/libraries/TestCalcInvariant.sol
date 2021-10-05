// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   ReplicationMath Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestCalcInvariant {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    uint256 public scaleFactorRisky;
    uint256 public scaleFactorStable;

    function set(uint256 prec0, uint256 prec1) public {
        scaleFactorRisky = prec0;
        scaleFactorStable = prec1;
    }

    function step0(
        uint256 reserveRisky,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserve2) {
        reserve2 = ReplicationMath
            .getStableGivenRisky(0, scaleFactorRisky, scaleFactorStable, reserveRisky, strike, sigma, tau)
            .scaleToX64(scaleFactorStable);
    }

    function step1(uint256 reserveStable, int128 reserve2) public view returns (int128 invariant) {
        invariant = reserveStable.scaleToX64(scaleFactorStable).sub(reserve2);
    }

    /// @return invariant Uses the trading function to calculate the invariant, which starts at 0 and grows with fees
    function calcInvariantRisky(
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 invariant) {
        int128 reserve2 = step0(reserveRisky, strike, sigma, tau);
        invariant = step1(reserveStable, reserve2);
    }

    function calcInvariantStable(
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
