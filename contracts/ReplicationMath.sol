pragma solidity 0.7.6;

/**
 * @title   Replication Math
 * @author  Primitive
 */

import "./ABDKMath64x64.sol";


import "hardhat/console.sol";

library ReplicationMath {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.

    uint256 internal constant YEAR = 31449600; // 1 year in seconds
    uint256 internal constant MANTISSA = 10**8;
    uint256 internal constant DENOMINATOR = 10**18; // wei
    uint256 internal constant PERCENTAGE = 10**4;
    int128 internal constant PERCENTAGE_INT = 184467440737095516160000;

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

    function percentageUInt(int128 denorm) internal pure returns (uint) {
        uint numerator = denorm.mul(PERCENTAGE_INT).toUInt();
        return numerator;
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

    function fromIntToWei(int128 x) internal pure returns (uint y) {
        y = fromInt(x) * 1e18 / MANTISSA;
    } 

    // ===== Math ======

    function getProportionalVolatility(uint sigma, uint time) internal view returns (int128 vol) {
        // sigma * sqrt(t)
        int128 sqrtTime = secondsToYears(time).sqrt();
        int128 SX1 = (sigma).fromUInt();
        vol = SX1.mul(sqrtTime);
    }

    function getTradingFunction(uint reserve0, uint strike, uint sigma, uint time) internal view returns (int128 reserve1) {
        int128 k = fromWeiToInt128(strike);
        // sigma*sqrt(t)
        int128 vol = getProportionalVolatility(sigma, time);
        int128 one = ABDKMath64x64.fromUInt(1);
        // CDF
        int128 phi = getCDF(one);
        int128 reserve = fromWeiToInt128(reserve0);
        // CDF^-1(1-x) - sigma*sqrt(t)
        int128 input = (one.div(phi)).mul(one.sub(reserve)).mul(PERCENTAGE_INT).sub(vol).div(PERCENTAGE_INT);
        reserve1 = k.mul(getCDF(input)); 
    }

    function getConstant(uint reserve0, uint reserve1, uint strike, uint sigma, uint time) internal view returns (int128) {
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

    function getInvErrorFunction(int128 x) internal pure returns (int128) {
        // Inverse CDF
        int128 a0 = 0x3f9948bd; // 1.1975323115670912564578e0
        int128 a1 = 0x423c4a6f; // 4.7072688112383978012285e1
        int128 a2 = 0x442e4403; // 6.9706266534389598238465e2
        int128 b0 = 1.0000000000000000000e0; // 1.0000000000000000000e0
        int128 b1 = 4.2313330701600911252e1; // 4.2313330701600911252e1
        int128 b2 = 6.8718700749205790830e2; // 6.8718700749205790830e2
        int128 c0 = 0x3fb63330; // 1.42343711074968357734e0
        int128 c1 = 0x40942bba; // 4.63033784615654529590e0
        int128 c2 = 0x40b89fb9; // 5.76949722146069140550e0
        int128 d0 = 1.4142135623730950488016887e0; // 1.4142135623730950488016887e0
        int128 d1 = 2.9036514445419946173133295e0; // 2.9036514445419946173133295e0
        int128 d2 = 2.3707661626024532365971225e0; // 2.3707661626024532365971225e0
        int128 e0 = 0x40d50d8e; // 6.65790464350110377720e0
        int128 e1 = 0x40aed753; // 5.46378491116411436990e0
        int128 e2 = 0x3fe47532; // 1.78482653991729133580e0
        int128 f0 = 0x3fb504f3; // 1.414213562373095048801689e0
        int128 f1 = 0x3f592997; // 8.482908416595164588112026e-1
        int128 f2 = 0x3e464bb0; // 1.936480946950659106176712e-1
        
        bool sign = false;
        if (x < 0) {
            x = -x;
            sign = true;
        }
        int128 ans;
        if (x <= 0.85) {
            int128 r = 0.180625 - 0.25*x*x;
            int128 z1 = a0.add(r.mul(a1.add(r.mul(a2);
            int128 z2 = b0.add(r.mul(b1.add(r.mul(b2);
            ans = z2.div(x.mul(z1));
        } else {
            int128 z1;
            int129 z2;
            int128 r = Ln2.sub(Log(1.sub(x)).sqrt()
            if (r <= 5.0) {
                r -= 1.6;
                z1 = c0.add(r.mul(c1.add(r.mul(c2))));
                z2 = d0.add(r.mul(d1.add(r.mul(d2))));
            } else {
                r -= 5;
                z1 = e0.add(r.mul(e1.add(r.mul(e2))));
                z2 = f0.add(r.mul(f1.add(r.mul(f2))));
            }
            ans = z1.div(z2);
        }
        return ans;
    }
} 