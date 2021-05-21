pragma solidity 0.8.0;

/**
 * @title   Black Scholes Math Lib TEST contract
 * @author  Primitive
 * @dev     ONLY FOR TESTING PURPOSES.  
 */

import "../interfaces/IPrimitiveEngine.sol";
import "../libraries/ABDKMath64x64.sol";
import "../libraries/BlackScholes.sol";
import "../libraries/Calibration.sol";
import "../libraries/ReplicationMath.sol";
import "../libraries/Reserve.sol";
import "../libraries/Units.sol";

contract TestBlackScholes {
    using Units for *;
    using ReplicationMath for *;
    using BlackScholes for *;
    using CumulativeNormalDistribution for *;

    IPrimitiveEngine public engine;

    constructor(address engine_)  {
        engine = IPrimitiveEngine(engine_);
    }

    // ==== Cumulative Normal Distribution Function Library Entry ====

    function cdf(uint x) public view returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return z.getCDF();
    }

    function icdf(uint x) public view returns (int128 y) {
        //int128 p = 0x4000000000000830; // 0.25
        int128 p = x.parseUnits();
        y = p.getInverseCDF();
    }

    // ===== Replication Library Entry =====

    function proportionalVol(bytes32 pid) public view returns (int128) {
        (uint strike, uint sigma, uint time) = engine.settings(pid);
        return ReplicationMath.getProportionalVolatility(sigma, time);
    }

    function tradingFunction(bytes32 pid) public view returns (int128) {
        (uint strike, uint sigma, uint time) = engine.settings(pid);
        (uint RX1, , uint liquidity, ,) = engine.reserves(pid);
        return ReplicationMath.getTradingFunction(RX1, liquidity, strike, sigma, time);
    }

    function invariant(bytes32 pid) public view returns (int128) {
        return engine.invariantOf(pid);
    }

    // ===== BS Library Entry ====

    function callDelta(Calibration.Data memory self, uint assetPrice) public view returns (int128 y) {
        y = BlackScholes.deltaCall(assetPrice, self.strike, self.sigma, self.time);
    }

    function putDelta(Calibration.Data memory self, uint assetPrice) public view returns (int128 y) {
        y = BlackScholes.deltaPut(assetPrice, self.strike, self.sigma, self.time);
    }

    function d1(Calibration.Data memory self, uint assetPrice) public view returns (int128 y) {
        y = BlackScholes.d1(assetPrice, self.strike, self.sigma, self.time);
    }

    function moneyness(Calibration.Data memory self, uint assetPrice) public view returns (int128 y) {
        y = BlackScholes.logSimpleMoneyness(assetPrice, self.strike);
    }
}
