// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

library SafeCast {
    function toUint128(uint256 x) internal pure returns (uint128 z) {
        require((z = uint128(x)) == x);
    }

    function toUint64(uint256 x) internal pure returns (uint128 z) {
        require((z = uint64(x)) == x);
    }
}
