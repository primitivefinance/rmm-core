// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Black Scholes Math Lib API Test
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.

import "../../libraries/ABDKMath64x64.sol";
import "../../libraries/BlackScholes.sol";
import "../../libraries/Units.sol";


contract TestBlackScholes {
    using Units for *;
    using BlackScholes for *;
    using CumulativeNormalDistribution for *;

    struct Calibration {// Parameters of each pool
        uint128 strike; // strike price of the option
        uint64 sigma;   // implied volatility of the option
        uint64 time;    // the time in seconds until the option expires
    }

    constructor()  {}

    // ==== Cumulative Normal Distribution Function Library Entry ====

    function cdf(uint x) public pure returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return z.getCDF();
    }

    function icdf(uint x) public pure returns (int128 y) {
        //int128 p = 0x4000000000000830; // 0.25
        int128 p = x.parseUnits();
        y = p.getInverseCDF();
    }

    // ===== BS Library Entry ====

    function callDelta(Calibration memory self, uint assetPrice) public pure returns (int128 y) {
        y = BlackScholes.deltaCall(assetPrice, uint(self.strike), uint(self.sigma), uint(self.time));
    }

    function putDelta(Calibration memory self, uint assetPrice) public pure returns (int128 y) {
        y = BlackScholes.deltaPut(assetPrice, uint(self.strike), uint(self.sigma), uint(self.time));
    }

    function d1(Calibration memory self, uint assetPrice) public pure returns (int128 y) {
        y = BlackScholes.d1(assetPrice, uint(self.strike), uint(self.sigma), uint(self.time));
    }

    function moneyness(Calibration memory self, uint assetPrice) public pure returns (int128 y) {
        y = BlackScholes.logSimpleMoneyness(assetPrice, uint(self.strike));
    }
}
