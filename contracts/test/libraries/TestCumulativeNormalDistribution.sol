// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Cumulative Normal Distribution Math Lib API Test
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.

import "../../libraries/ABDKMath64x64.sol";
import "../../libraries/CumulativeNormalDistribution.sol";
import "../../libraries/Units.sol";

contract TestCumulativeNormalDistribution {
    using Units for int128;
    using Units for uint256;
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;
    using CumulativeNormalDistribution for int128;
    using CumulativeNormalDistribution for uint256;

    uint256 public constant PRECISION = 1e18;

    constructor() {}

    // ==== Cumulative Normal Distribution Function Library Entry ====
    function signedCDF(uint256 x) public pure returns (int128) {
        int128 z = -x.divu(PRECISION);
        return z.getCDF();
    }

    function cdf(uint256 x) public pure returns (int128) {
        int128 z = x.divu(PRECISION);
        return z.getCDF();
    }

    function cdfX64(int128 z) public pure returns (int128) {
        z = -z;
        return z.getCDF();
    }

    function inverseCDF(uint256 x) public pure returns (int128 y) {
        int128 p = x.divu(PRECISION);
        y = p.getInverseCDF();
    }

    function signedInverseCDF(uint256 x) public pure returns (int128 y) {
        int128 p = -x.divu(PRECISION);
        y = p.getInverseCDF();
    }

    function icdf(uint256 x) public pure returns (int128 y) {
        //int128 p = 0x4000000000000830; // 0.25
        int128 p = x.scaleToX64(1);
        y = p.getInverseCDF();
    }

    function inverseCDFHighTail() public pure returns (int128 y) {
        int128 p = CumulativeNormalDistribution.HIGH_TAIL.add(1);
        y = p.getInverseCDF();
    }

    function inverseCDFLowTail() public pure returns (int128 y) {
        int128 p = CumulativeNormalDistribution.LOW_TAIL.sub(1);
        y = p.getInverseCDF();
    }
}
