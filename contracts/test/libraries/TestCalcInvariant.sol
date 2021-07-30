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

    function step0(
        uint256 reserveRisky,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public pure returns (int128 reserve2) {
        reserve2 = ReplicationMath.getTradingFunction(0, reserveRisky, liquidity, strike, sigma, tau);
    }

    function step1(uint256 reserveStable, int128 reserve2) public pure returns (int128 invariant) {
        invariant = reserveStable.parseUnits().sub(reserve2);
    }

    /// @return invariant Uses the trading function to calculate the invariant, which starts at 0 and grows with fees
    function calcInvariant(
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public pure returns (int128 invariant) {
        int128 reserve2 = step0(reserveRisky, liquidity, strike, sigma, tau);
        invariant = step1(reserveStable, reserve2);
    }
}
