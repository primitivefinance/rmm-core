// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Cumulative Normal Distribution Math Lib API Test
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.

import "../../libraries/ABDKMath64x64.sol";
import "../../libraries/CumulativeNormalDistribution.sol";
import "../../libraries/Units.sol";

contract TestCumulativeNormalDistribution {
    using Units for *;
    using CumulativeNormalDistribution for *;

    constructor() {}

    // ==== Cumulative Normal Distribution Function Library Entry ====

    function cdf(uint256 x) public pure returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return z.getCDF();
    }

    function icdf(uint256 x) public pure returns (int128 y) {
        //int128 p = 0x4000000000000830; // 0.25
        int128 p = x.scaleToX64(1e18);
        y = p.getInverseCDF();
    }
}
