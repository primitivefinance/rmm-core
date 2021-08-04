// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   ReplicationMath Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestReplicationMath {
    /// @return vol The sigma * sqrt(tau)
    function getProportionalVolatility(uint256 sigma, uint256 tau) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, tau);
    }

    /// @return reserveStable The calculated stable reserve, using the risky reserve
    function getStableGivenRisky(
        int128 invariantLast,
        uint256 reserveRisky,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public pure returns (int128 reserveStable) {
        reserveStable = ReplicationMath.getStableGivenRisky(invariantLast, reserveRisky, strike, sigma, tau);
    }

    /// @return reserveRisky The calculated risky reserve, using the stable reserve
    function getRiskyGivenStable(
        int128 invariantLast,
        uint256 reserveStable,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public pure returns (int128 reserveRisky) {
        reserveRisky = ReplicationMath.getRiskyGivenStable(invariantLast, reserveStable, strike, sigma, tau);
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
        invariant = ReplicationMath.calcInvariant(reserveRisky, reserveStable, strike, sigma, tau);
    }
}
