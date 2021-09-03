// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Units library
/// @author  Primitive
/// @notice  Utility functions for unit conversions

import "./ABDKMath64x64.sol";

library Units {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.

    uint256 internal constant YEAR = 31449600; // 1 year in seconds
    uint256 internal constant DENOMINATOR = 10**18; // wei
    uint256 internal constant MANTISSA = 10**8;
    uint256 internal constant PERCENTAGE = 10**4;
    int128 internal constant MANTISSA_INT = 18446744073709500000000000000;
    int128 internal constant PERCENTAGE_INT = 184467440737095516160000;

    // ===== Unit Conversion =====

    /// @notice Scales a wei value to a precision of 1e18
    function scaleUp(uint256 value, uint256 precision) internal pure returns (uint256 y) {
        // value * 1e18 / precision
        y = (value * DENOMINATOR) / precision;
    }

    /// @notice Scales a wei value from a precision of 1e18 to `precision`
    function scaleDown(uint256 value, uint256 precision) internal pure returns (uint256 y) {
        // value * precision / 1e18
        y = (value * precision) / DENOMINATOR;
    }

    /// @notice             Converts unsigned 256-bit wei value into a fixed point 64.64 number
    /// @param   value      Unsigned 256-bit wei amount to convert
    /// @param   precision  Decimals to scale down by, assumes `value` has this level of precision
    /// @return  y          Signed 64.64 fixed point wei value
    function scaleToX64(uint256 value, uint256 precision) internal pure returns (int128 y) {
        y = value.divu(precision);
    }

    /// @notice             Converts signed fixed point 64.64 number into unsigned 256-bit wei value
    /// @param   value      Signed fixed point 64.64 number to convert from
    /// @param   precision  Decimals to scale up by, assumes `value` has this level of precision
    /// @return  y          Unsigned 256-bit wei value
    function scalefromX64(int128 value, uint256 precision) internal pure returns (uint256 y) {
        y = value.mulu(precision);
    }

    /// @notice         Converts denormalized percentage integer
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param denorm   Unsigned percentage integer with precision of 10**4
    /// @return         Signed 64.64 fixed point percentage with precision of 10**4
    function percentage(uint256 denorm) internal pure returns (int128) {
        return denorm.divu(PERCENTAGE);
    }

    /// @notice         Converts signed 64.64 fixed point percentage
    /// @dev            Converts signed 64.64 fixed point percentage to a denormalized unsigned percentage
    /// @param denorm   Signed 64.64 fixed point percentage
    /// @return         Unsigned percentage denormalized with precision of 10**4
    function percentage(int128 denorm) internal pure returns (uint256) {
        return denorm.mulu(PERCENTAGE);
    }

    /// @notice         Converts unsigned seconds integer into years as a signed 64.64 fixed point number
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param s        Unsigned 256-bit integer amount of seconds to convert into year units
    /// @return         Int128 years equal to `seconds`
    function toYears(uint256 s) internal pure returns (int128) {
        return s.divu(YEAR);
    }

    /// @dev            Converts a numerator x with denominator 2^64 into an uint256
    /// @notice         Will return 0 if a fraction < 10^8
    /// @param   x      Int128 to convert to a denormalized uint with MANTISSA
    /// @return  y      Uint of `x` scaled by MANTISSA
    function fromInt(int128 x) internal pure returns (uint256 y) {
        x = x.mul((MANTISSA).fromUInt());
        y = x > 0 ? (x).toUInt() : uint256(0);
    }
}
