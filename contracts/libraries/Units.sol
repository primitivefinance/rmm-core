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

    /// @dev            Converts a wei value uint256 into an int128 numerator value
    /// @param   x      Wei value
    /// @return  y      Wei value as an int128
    function parseUnits(uint256 x) internal pure returns (int128 y) {
        y = x.divu(DENOMINATOR);
    }

    /// @dev            Converts a wei value int128 into an uint256 value
    /// @param   x      Wei value as an int128
    /// @return  y      Wei value
    function parseUnits(int128 x) internal pure returns (uint256 y) {
        y = (fromInt(x) * 1e18) / MANTISSA;
    }

    /// @dev            Converts a denormalized percentage (10000 = 100%, 100 = 1%) into an int128
    /// @param denorm   Percentage value multiplied by PERCENTAGE, which is 10000
    function percentage(uint256 denorm) internal pure returns (int128) {
        int128 numerator = denorm.fromUInt();
        int128 denominator = PERCENTAGE.fromUInt();
        return numerator.div(denominator);
    }

    /// @dev            Converts an int128 percentage to a denormalized uint percentage
    /// @param denorm   Int128 percentage
    /// @return         Uint percentage denormalized by PERCENTAGE, which is 10000
    function percentage(int128 denorm) internal pure returns (uint256) {
        uint256 numerator = denorm.mul(PERCENTAGE_INT).toUInt();
        return numerator;
    }

    /// @dev            Converts seconds units into an int128 with units of years
    /// @param quantitySeconds Amount of seconds to convert into year units
    /// @return         Int128 years equal to `quantitySeconds`
    function toYears(uint256 quantitySeconds) internal pure returns (int128) {
        int128 time = quantitySeconds.fromUInt();
        int128 units = YEAR.fromUInt();
        return time.div(units);
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
