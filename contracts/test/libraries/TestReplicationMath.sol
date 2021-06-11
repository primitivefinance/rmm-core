// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/ReplicationMath.sol";

/// @title   ReplicationMath Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestReplicationMath {

    /// @return vol The sigma * sqrt(time)
    function getProportionalVolatility(uint sigma, uint time) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, time);
    }

    /// @return RY2 The calculated stable reserve, using the risky reserve
    function getTradingFunction(uint RX1, uint liquidity, uint strike, uint sigma, uint time) public pure returns (int128 RY2) {
        RY2 = ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }

    /// @return RX1 The calculated risky reserve, using the stable reserve
    function getInverseTradingFunction(uint RY2, uint liquidity, uint strike, uint sigma, uint time) public pure returns (int128 RX1) {
        RX1 = ReplicationMath.getInverseTradingFunction(RY2, liquidity, strike, sigma, time);
    }

    /// @return invariant Uses the trading function to calculate the invariant, which starts at 0 and grows with fees
    function calcInvariant(uint RX1, uint RY2, uint liquidity, uint strike, uint sigma, uint time) public pure returns (int128 invariant) {
        invariant = ReplicationMath.calcInvariant(RX1, RY2, liquidity, strike, sigma, time);
    }
}