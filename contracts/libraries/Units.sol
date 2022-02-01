// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "./ABDKMath64x64.sol";

/// @title   Units library
/// @author  Primitive
/// @notice  Utility functions for unit conversions
library Units {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    uint256 internal constant YEAR = 31556952; // 365.24219 ephemeris day = 1 year, in seconds
    uint256 internal constant PRECISION = 1e18; // precision to scale to
    uint256 internal constant PERCENTAGE = 1e4; // precision of percentages

    // ===== Unit Conversion =====

    /// @notice             Scales a wei value to a precision of 1e18 using the scaling factor
    /// @param   value      Unsigned 256-bit wei amount to convert with native decimals
    /// @param   factor     Scaling factor to multiply by, i.e. 10^(18 - value.decimals())
    /// @return  y          Unsigned 256-bit wei amount scaled to a precision of 1e18
    function scaleUp(uint256 value, uint256 factor) internal pure returns (uint256 y) {
        y = value * factor;
    }

    /// @notice             Scales a wei value from a precision of 1e18 to 10^(18 - precision)
    /// @param   value      Unsigned 256-bit wei amount with 18 decimals
    /// @param   factor     Scaling factor to divide by, i.e. 10^(18 - value.decimals())
    /// @return  y          Unsigned 256-bit wei amount scaled to 10^(18 - factor)
    function scaleDown(uint256 value, uint256 factor) internal pure returns (uint256 y) {
        y = value / factor;
    }

    /// @notice             Converts unsigned 256-bit wei value into a fixed point 64.64 number
    /// @param   value      Unsigned 256-bit wei amount, in native precision
    /// @param   factor     Scaling factor for `value`, used to calculate decimals of `value`
    /// @return  y          Signed 64.64 fixed point number scaled from native precision
    function scaleToX64(uint256 value, uint256 factor) internal pure returns (int128 y) {
        uint256 scaleFactor = PRECISION / factor;
        y = value.divu(scaleFactor);
    }

    /// @notice             Converts signed fixed point 64.64 number into unsigned 256-bit wei value
    /// @param   value      Signed fixed point 64.64 number to convert from precision of 10^18
    /// @param   factor     Scaling factor for `value`, used to calculate decimals of `value`
    /// @return  y          Unsigned 256-bit wei amount scaled to native precision of 10^(18 - factor)
    function scaleFromX64(int128 value, uint256 factor) internal pure returns (uint256 y) {
        uint256 scaleFactor = PRECISION / factor;
        y = value.mulu(scaleFactor);
    }

    /// @notice         Converts denormalized percentage integer to a fixed point 64.64 number
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param denorm   Unsigned percentage integer with precision of 1e4
    /// @return         Signed 64.64 fixed point percentage with precision of 1e4
    function percentageToX64(uint256 denorm) internal pure returns (int128) {
        return denorm.divu(PERCENTAGE);
    }

    /// @notice         Converts unsigned seconds integer into years as a signed 64.64 fixed point number
    /// @dev            Convert unsigned 256-bit integer number into signed 64.64 fixed point number
    /// @param s        Unsigned 256-bit integer amount of seconds to convert into year units
    /// @return         Fixed point 64.64 number of years equal to `seconds`
    function toYears(uint256 s) internal pure returns (int128) {
        return s.divu(YEAR);
    }
}
