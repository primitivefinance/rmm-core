// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Reserve Math
/// @author  Primitive

import "../libraries/ReplicationMath.sol";

library ReserveMath {
    using Units for *;
    using ABDKMath64x64 for *;

    function reserveRisky(uint RY2, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RX1) {
        RX1 = ReplicationMath.getInverseTradingFunction(RY2, liquidity, strike, sigma, time);
    }

    function reserveStable(uint RX1, uint liquidity, uint strike, uint sigma, uint time) internal pure returns (int128 RY2) {
        RY2 = ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }
}