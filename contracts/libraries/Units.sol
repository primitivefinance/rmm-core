pragma solidity 0.7.6;

/**
 * @title   Units library
 * @author  Primitive
 * @notice  Utility functions for unit conversions.
 */

import "./ABDKMath64x64.sol";

library Units {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.

    uint256 internal constant YEAR = 31449600; // 1 year in seconds
    uint256 internal constant MANTISSA = 10**8;
    uint256 internal constant DENOMINATOR = 10**18; // wei
    uint256 internal constant PERCENTAGE = 10**4;
    int128 internal constant PERCENTAGE_INT = 184467440737095516160000;

    // ===== Unit Conversion =====

    /**
     * @dev     Converts a wei value uint256 into an int128 numerator value.
     * @param   x The wei value.
     * @return  y The wei value as an int128.
     */
    function parseUnits(uint256 x) internal pure returns (int128 y) {
        y =  x.divu(DENOMINATOR);
    }

    /**
     * @dev     Converts a wei value int128 into an uint256 value.
     * @param   x The wei value as an int128.
     * @return  y The wei value.
     */
    function parseUnits(int128 x) internal pure returns (uint y) {
        y = fromInt(x) * 1e18 / MANTISSA;
    } 

    /**
     * @dev     Converts a denormalized percentage (10000 = 100%, 100 = 1%) into an int128.
     * @param   denorm The percentage value multiplied by PERCENTAGE, which is 10,000.
     */
    function percentage(uint256 denorm) internal pure returns (int128) {
        int128 numerator = denorm.fromUInt();
        int128 denominator = PERCENTAGE.fromUInt();
        return numerator.div(denominator);
    }

    /**
     * @dev     Converts an int128 percentage to a denormalized uint percentage.
     * @param   denorm The int128 percentage.
     * @return  The uint percentage denormalized by PERCENTAGE, which is 10,000.
     */
    function percentage(int128 denorm) internal pure returns (uint) {
        uint numerator = denorm.mul(PERCENTAGE_INT).toUInt();
        return numerator;
    }

    /**
     * @dev     Converts second units into an int128 with units of years.
     * @param   quantitySeconds The amount of seconds to convert into year units.
     * @return  The int128 years equal to `quantitySeconds`.
     */
    function toYears(uint256 quantitySeconds) internal pure returns (int128) {
        int128 time = quantitySeconds.fromUInt();
        int128 units = YEAR.fromUInt();
        return time.div(units);
    }

    /**
     * @dev     Converts a numerator x with denominator 2^64 into an uint256.
     * @notice  Will return 0 if a fraction < 10^8.
     * @param   x The int128 to convert to a denormalized uint with MANTISSA.
     * @return  y The uint of `x` scaled by MANTISSA.
     */
    function fromInt(int128 x) internal pure returns (uint256 y) {
        x = x.mul((MANTISSA).fromUInt());
        y = x > 0 ? (x).toUInt() : uint256(0);
    }

    
}