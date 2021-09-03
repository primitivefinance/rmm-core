// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Units library
/// @author  Primitive
/// @notice  Utility functions for unit conversions

import "./ABDKMath64x64.sol";

library Units {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64

    uint256 internal constant YEAR = 31556952; // 365.24219 ephemeris day = 1 year, in seconds
    uint256 internal constant DENOMINATOR = 10**18; // precision to scale to
    uint256 internal constant PERCENTAGE = 1e4;

    // ===== Unit Conversion =====

    /// @notice             Scales a wei value to a precision of 1e18
    /// @param   value      Unsigned 256-bit wei amount to convert
    /// @param   precision  10**decimals to scale up by, assumes `value` has this level of precision
    /// @return  y          Unsigned 256-bit wei amount scaled to a precision of 1e18
    function scaleUp(uint256 value, uint256 precision) internal pure returns (uint256 y) {
        y = (value * DENOMINATOR) / precision;
    }

    /// @notice             Scales a wei value from a precision of 1e18 to `precision`
    /// @param   value      Unsigned 256-bit wei amount to convert
    /// @param   precision  10**decimals to scale down by, assumes `value` has this level of precision
    /// @return  y          Unsigned 256-bit wei amount scaled to `precision`
    function scaleDown(uint256 value, uint256 precision) internal pure returns (uint256 y) {
        y = (value * precision) / DENOMINATOR;
    }

    /// @notice             Converts unsigned 256-bit wei value into a fixed point 64.64 number
    /// @param   value      Unsigned 256-bit wei amount to convert
    /// @param   precision  10**decimals to scale down by, assumes `value` has this level of precision
    /// @return  y          Signed 64.64 fixed point wei value
    function scaleToX64(uint256 value, uint256 precision) internal pure returns (int128 y) {
        y = value.divu(precision);
    }

    /// @notice             Converts signed fixed point 64.64 number into unsigned 256-bit wei value
    /// @param   value      Signed fixed point 64.64 number to convert from
    /// @param   precision  10**decimals to scale up by, assumes `value` has this level of precision
    /// @return  y          Unsigned 256-bit wei value
    function scalefromX64(int128 value, uint256 precision) internal pure returns (uint256 y) {
        y = value.mulu(precision);
    }

    /// @notice         Converts denormalized percentage integer to a fixed point 64.64 number
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param denorm   Unsigned percentage integer with precision of 1e4
    /// @return         Signed 64.64 fixed point percentage with precision of 1e4
    function percentage(uint256 denorm) internal pure returns (int128) {
        return denorm.divu(PERCENTAGE);
    }

    /// @notice         Converts signed 64.64 fixed point percentage to a denormalized percetage integer
    /// @param denorm   Signed 64.64 fixed point percentage
    /// @return         Unsigned percentage denormalized with precision of 1e4
    function percentage(int128 denorm) internal pure returns (uint256) {
        return denorm.mulu(PERCENTAGE);
    }

    /// @notice         Converts unsigned seconds integer into years as a signed 64.64 fixed point number
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param s        Unsigned 256-bit integer amount of seconds to convert into year units
    /// @return         Fixed point 64.64 number of years equal to `seconds`
    function toYears(uint256 s) internal pure returns (int128) {
        return s.divu(YEAR);
    }
}
