// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Logit Math Library
 * @author  Primitive
 * @notice  Math library for caclulating prices along a logit curve.
 */

import "./ABDKMath64x64.sol";
import "./Units.sol";


library LogitMath {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using Units for *;

    struct Params {
        int256 slope;
        int256 translation;
        uint32 fee;
    }

    /**
     * @notice  Fetches the output of RY2 for 1 unit of RX1.
     */
    function getTradingFunction(uint RX1, uint RY2, uint liquidity, Params memory params) internal pure returns (int128 deltaY) {
        uint p = RX1 * 1e18 / (RX1 + RY2);
        int128 rate = calcInvariant(p, params.slope, params.translation);
        int128 one = uint(1).fromUInt();
        deltaY = one.div(rate.add(params.fee.fromUInt()));
    }

    /**
     * @return invariant = (1 / slope) * ln(p / (1 - p)) + translation
     */
    function calcInvariant(uint p, int slope, int translation) internal pure returns (int128 invariant) {
        int128 parsed = p.parseUnits();
        int128 one = uint(1).fromUInt();
        int128 input = parsed.mul(one).div(one.sub(parsed));
        int128 logarithm = input.ln();
        invariant = logarithm.div(slope.from128x128()).add(translation.from128x128());
    }
}