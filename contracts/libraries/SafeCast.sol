// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0;

/// @title  SafeCast
/// @notice Safely cast between uint256 and uint128
library SafeCast {
    /// @notice reverts if x > type(uint128).max
    function toUint128(uint256 x) internal pure returns (uint128 z) {
        require((z = uint128(x)) == x);
    }
}
