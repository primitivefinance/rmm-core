// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Cumulative Normal Distribution Math Library
/// @author  Primitive
/// @notice  Uses the ABDK64x64 math library and error function to approximate CDFs.

import "./ABDKMath64x64.sol";

library CumulativeNormalDistribution {
    using ABDKMath64x64 for *;

    /// @notice Returns the Normal Standard Cumulative Distribution Function for `x`
    function getCDF(int128 x) internal pure returns (int128) {
        // where p = 0.3275911,
        // a1 = 0.254829592, a2 = −0.284496736, a3 = 1.421413741, a4 = −1.453152027, a5 = 1.061405429
        int128 p = 0x53dd02a4f5ee2e46;
        int128 one = uint256(1).fromUInt();
        int128 two = uint256(2).fromUInt();
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

    /// @notice  Returns the inverse CDF, or quantile function of `p`.
    function getInverseCDF(int128 p) internal pure returns (int128) {
        int128 half = 0x8000000000001060; // 0.5
        int128 q = p.sub(half);
        int128 r = q.pow(2);
        int128 a0 = 0x26A8F3C1F21B39C0; // 0.151015506
        int128 a1 = -0x87C57E5DA70D0FE0; // -0.530357263
        int128 a2 = 0x15D71F57212414CA0; // 1.365020123
        int128 b0 = 0x21D0A04B0E9BA0F0; // 0.132089632
        int128 b1 = -0xC2BF5D74C7247680; // -0.760732499
        // fcentral(p) = q * (a2 + (a1r + a0) / (r^2 + b1r +b0))
        int128 result = q.mul(a2.add((a1.mul(r).add(a0)).div((r.pow(2).add(b1.mul(r)).add(b0)))));
        return result;
    }

    /// @notice Returns the Error Function for approximating the Standard Normal CDF
    function getErrorFunction(int128 z, int128 t) internal pure returns (int128) {
        // where a1 = 0.254829592, a2 = −0.284496736, a3 = 1.421413741, a4 = −1.453152027, a5 = 1.061405429
        int128 step1; // t * (1.4214 + (t * (-1.4531 + (t * 1.0614))))
        {
            int128 a3 = 0x16a09e667f3bcc908;
            int128 a4 = -0x17401c57014c38f14;
            int128 a5 = 0x10fb844255a12d72e;
            step1 = t.mul(a3.add(t.mul(a4.add(t.mul(a5)))));
        }

        int128 result; // 1 - t * (step2 * e^-2z)
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
