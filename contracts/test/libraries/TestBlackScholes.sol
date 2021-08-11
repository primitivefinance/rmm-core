// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

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

    struct Calibration {
        // Parameters of each pool
        uint128 strike; // strike price of the option
        uint64 sigma; // implied volatility of the option
        uint32 maturity; // the time in seconds until the option expires
        uint32 lastTimestamp;
    }

    constructor() {}

    // ==== Cumulative Normal Distribution Function Library Entry ====

    function cdf(uint256 x) public pure returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return z.getCDF();
    }

    function icdf(uint256 x) public pure returns (int128 y) {
        //int128 p = 0x4000000000000830; // 0.25
        int128 p = x.parseUnits();
        y = p.getInverseCDF();
    }

    // ===== BS Library Entry ====

    function callDelta(Calibration memory self, uint256 assetPrice) public pure returns (int128 y) {
        y = BlackScholes.deltaCall(assetPrice, self.strike, self.sigma, self.maturity - self.lastTimestamp);
    }

    function d1(Calibration memory self, uint256 assetPrice) public pure returns (int128 y) {
        y = BlackScholes.d1(assetPrice, self.strike, self.sigma, self.maturity - self.lastTimestamp);
    }

    function moneyness(Calibration memory self, uint256 assetPrice) public pure returns (int128 y) {
        y = BlackScholes.logSimpleMoneyness(assetPrice, self.strike);
    }
}
