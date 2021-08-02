// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../PrimitiveEngine.sol";

contract MockEngine is PrimitiveEngine {
    uint256 public time = 1;

    function advanceTime(uint256 by) external {
        time += by;
    }

    function _blockTimestamp() internal view override returns (uint32 blockTimestamp) {
        blockTimestamp = uint32(time);
    }
}
