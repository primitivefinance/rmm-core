// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.4;

import "./ABDKMath64x64.sol";

/// @title   Cumulative Normal Distribution Math Library
/// @author  Primitive
library CumulativeNormalDistribution {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    /// @notice Thrown on passing an arg that is out of the input range for these math functions
    error InverseOutOfBounds(int128 value);

    int128 public constant ONE_INT = 0x10000000000000000;
    int128 public constant TWO_INT = 0x20000000000000000;
    int128 public constant CDF0 = 0x53dd02a4f5ee2e46;
    int128 public constant CDF1 = 0x413c831bb169f874;
    int128 public constant CDF2 = -0x48d4c730f051a5fe;
    int128 public constant CDF3 = 0x16a09e667f3bcc908;
    int128 public constant CDF4 = -0x17401c57014c38f14;
    int128 public constant CDF5 = 0x10fb844255a12d72e;

    /// @notice Uses Abramowitz and Stegun approximation:
    ///         https://en.wikipedia.org/wiki/Abramowitz_and_Stegun
    /// @dev    Maximum error: 3.15x10-3
    /// @return Standard Normal Cumulative Distribution Function of `x`
    function getCDF(int128 x) internal pure returns (int128) {
        int128 z = x.div(CDF3);
        int128 t = ONE_INT.div(ONE_INT.add(CDF0.mul(z.abs())));
        int128 erf = getErrorFunction(z, t);
        if (z < 0) {
            erf = erf.neg();
        }
        int128 result = (HALF_INT).mul(ONE_INT.add(erf));
        return result;
    }

    /// @notice Uses Abramowitz and Stegun approximation:
    ///         https://en.wikipedia.org/wiki/Error_function
    /// @dev    Maximum error: 1.5×10−7
    /// @return Error Function for approximating the Standard Normal CDF
    function getErrorFunction(int128 z, int128 t) internal pure returns (int128) {
        int128 step1 = t.mul(CDF3.add(t.mul(CDF4.add(t.mul(CDF5)))));
        int128 step2 = CDF1.add(t.mul(CDF2.add(step1)));
        int128 result = ONE_INT.sub(t.mul(step2.mul((z.mul(z).neg()).exp())));
        return result;
    }

    int128 public constant HALF_INT = 0x8000000000000000;
    int128 public constant INVERSE0 = 0x26A8F3C1F21B336E;
    int128 public constant INVERSE1 = -0x87C57E5DA70D3C90;
    int128 public constant INVERSE2 = 0x15D71F5721242C787;
    int128 public constant INVERSE3 = 0x21D0A04B0E9B94F1;
    int128 public constant INVERSE4 = -0xC2BF5D74C724E53F;

    int128 public constant LOW_TAIL = 0x666666666666666; // 0.025
    int128 public constant HIGH_TAIL = 0xF999999999999999; // 0.975

    /// @notice  Returns the inverse CDF, or quantile function of `p`.
    /// @dev     Source: https://arxiv.org/pdf/1002.0567.pdf
    ///          Maximum error of central region is 1.16x10−4
    /// @return  fcentral(p) = q * (a2 + (a1r + a0) / (r^2 + b1r +b0))
    function getInverseCDF(int128 p) internal pure returns (int128) {
        if (p >= ONE_INT || p <= 0) revert InverseOutOfBounds(p);
        // Short circuit for the central region, central region inclusive of tails
        if (p <= HIGH_TAIL && p >= LOW_TAIL) {
            return central(p);
        } else if (p < LOW_TAIL) {
            return tail(p);
        } else {
            int128 negativeTail = -tail(ONE_INT.sub(p));
            return negativeTail;
        }
    }

    /// @dev    Maximum error: 1.16x10−4
    /// @return Inverse CDF around the central area of 0.025 <= p <= 0.975
    function central(int128 p) internal pure returns (int128) {
        int128 q = p.sub(HALF_INT);
        int128 r = q.mul(q);
        int128 result = q.mul(
            INVERSE2.add((INVERSE1.mul(r).add(INVERSE0)).div((r.mul(r).add(INVERSE4.mul(r)).add(INVERSE3))))
        );
        return result;
    }

    int128 public constant C0 = 0x10E56D75CE8BCE9FAE;
    int128 public constant C1 = -0x2CB2447D36D513DAE;
    int128 public constant C2 = -0x8BB4226952BD69EDF;
    int128 public constant C3 = -0x1000BF627FA188411;
    int128 public constant C0_D = 0x10AEAC93F55267A9A5;
    int128 public constant C1_D = 0x41ED34A2561490236;
    int128 public constant C2_D = 0x7A1E70F720ECA43;
    int128 public constant D0 = 0x72C7D592D021FB1DB;
    int128 public constant D1 = 0x8C27B4617F5F800EA;

    /// @dev    Maximum error: 2.458x10-5
    /// @return Inverse CDF of the tail, defined for p < 0.0465, used with p < 0.025
    function tail(int128 p) internal pure returns (int128) {
        int128 r = ONE_INT.div(p.mul(p)).ln().sqrt();
        int128 step0 = C3.mul(r).add(C2_D);
        int128 numerator = C1_D.mul(r).add(C0_D);
        int128 denominator = r.mul(r).add(D1.mul(r)).add(D0);
        int128 result = step0.add(numerator.div(denominator));
        return result;
    }
}
