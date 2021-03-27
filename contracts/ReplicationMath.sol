pragma solidity 0.7.6;

/**
 * @title   Replication Math
 * @author  Primitive
 */

import "./ABDKMath64x64.sol";

library ReplicationMath {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.

    uint256 internal constant YEAR = 31449600; // 1 year in seconds
    uint256 internal constant MANTISSA = 10**8;
    uint256 internal constant DENOMINATOR = 10**18; // wei
    uint256 internal constant PERCENTAGE = 10**3;

    // ===== Unit Conversion =====

    /**
     * @dev Converts a wei value uint256 into an int128 numerator value.
     * @param x A uint256 amount.
     */
    function fromWeiToInt128(uint256 x) internal pure returns (int128) {
        return x.divu(DENOMINATOR);
    }

    /**
     * @dev Converts a denormalized percentage (1000 = 100%, 10 = 1%) into an int128.
     */
    function percentageInt128(uint256 denorm) internal pure returns (int128) {
        int128 numerator = denorm.fromUInt();
        int128 denominator = PERCENTAGE.fromUInt();
        return numerator.div(denominator);
    }

    /**
     * @dev Converts second units into an int128 with units of years.
     */
    function secondsToYears(uint256 quantitySeconds) internal pure returns (int128) {
        int128 time = quantitySeconds.fromUInt();
        int128 units = YEAR.fromUInt();
        return time.div(units);
    }

    /**
     * @dev Converts a numerator x with denominator 2^64 into an uint256.
     * @notice Will return 0 if a fraction < 10^8.
     */
    function fromInt(int128 x) internal pure returns (uint256 y) {
        x = x.mul((MANTISSA).fromUInt());
        y = x > 0 ? (x).toUInt() : uint256(0);
    }

    // ===== Math ======

    function getProportionalVolatility(uint sigma, uint time) internal pure returns (int128 vol) {
        // sigma * sqrt(t)
        vol = percentageInt128(sigma).mul((secondsToYears(time)).sqrt());
    }

    function getTradingFunction(uint reserve0, uint strike, uint sigma, uint time) internal pure returns (int128 reserve1) {
        int128 k = fromWeiToInt128(strike);
        // sigma*sqrt(t)
        int128 vol = getProportionalVolatility(sigma, time);
        int128 one = ABDKMath64x64.fromUInt(1);
        // CDF
        int128 phi = getCDF(one);
        int128 reserve = fromWeiToInt128(reserve0);
        // CDF^-1(1-x) - sigma*sqrt(t)
        int128 input = (one.div(phi)).mul(one.sub(reserve)).sub(vol);
        reserve1 = k.mul(getCDF(input)); 
    }

    function getConstant(uint reserve0, uint reserve1, uint strike, uint sigma, uint time) internal pure returns (int128) {
        int128 reserve2 = getTradingFunction(reserve0, strike, sigma, time);
        int128 k = fromWeiToInt128(reserve1).sub(reserve2);
        return k;
    }

    function getCDF(int128 x) internal pure returns (int128) {
        // where p = 0.3275911,
        // a1 = 0.254829592, a2 = −0.284496736, a3 = 1.421413741, a4 = −1.453152027, a5 = 1.061405429
        int128 p = 0x53dd02a4f5ee2e46;
        int128 one = ABDKMath64x64.fromUInt(1);
        int128 two = ABDKMath64x64.fromUInt(2);
        int128 a1 = 0x413c831bb169f874;
        int128 a2 = -0x48d4c730f051a5fe;
        int128 a3 = 0x16a09e667f3bcc908;
        int128 a4 = -0x17401c57014c38f14;
        int128 a5 = 0x10fb844255a12d72e;
        int128 z = x.div(a3);
        int128 t = one.div(one.add(p.mul(z.abs())));
        int128 erf = getErrorFunction(z, t);
        if (z < 0) {
            erf = erf.neg();
        }
        int128 result = (one.div(two)).mul(one.add(erf));
        return result;
    }

    function getErrorFunction(int128 z, int128 t) internal pure returns (int128) {
        // where a1 = 0.254829592, a2 = −0.284496736, a3 = 1.421413741, a4 = −1.453152027, a5 = 1.061405429
        int128 step1;
        {
            int128 a3 = 0x16a09e667f3bcc908;
            int128 a4 = -0x17401c57014c38f14;
            int128 a5 = 0x10fb844255a12d72e;
            step1 = t.mul(a3.add(t.mul(a4.add(t.mul(a5)))));
        }

        int128 result;
        {
            int128 one = ABDKMath64x64.fromUInt(1);
            int128 a1 = 0x413c831bb169f874;
            int128 a2 = -0x48d4c730f051a5fe;
            int128 step2 = a1.add(t.mul(a2.add(step1)));
            result = one.sub(t.mul(step2.mul(((z).pow(2).neg()).exp())));
        }
        return result;
    }
}