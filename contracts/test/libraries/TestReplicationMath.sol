// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/ReplicationMath.sol";

/// @title   ReplicationMath Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestReplicationMath {
    /// @return vol The sigma * sqrt(time)
    function getProportionalVolatility(uint256 sigma, uint256 time) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, time);
    }

    /// @return RY2 The calculated stable reserve, using the risky reserve
    function getTradingFunction(
        uint256 RX1,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 time
    ) public pure returns (int128 RY2) {
        RY2 = ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }

    /// @return RX1 The calculated risky reserve, using the stable reserve
    function getInverseTradingFunction(
        uint256 RY2,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 time
    ) public pure returns (int128 RX1) {
        RX1 = ReplicationMath.getInverseTradingFunction(RY2, liquidity, strike, sigma, time);
    }

    /// @return invariant Uses the trading function to calculate the invariant, which starts at 0 and grows with fees
    function calcInvariant(
        uint256 RX1,
        uint256 RY2,
        uint256 liquidity,
        uint256 strike,
        uint256 sigma,
        uint256 time
    ) public pure returns (int128 invariant) {
        invariant = ReplicationMath.calcInvariant(RX1, RY2, liquidity, strike, sigma, time);
    }
}
