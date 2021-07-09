pragma solidity 0.8.0;

import "../../PrimitiveEngine.sol";

contract MockEngine is PrimitiveEngine {
    uint256 public time = 0;

    function advanceTime(uint256 by) external {
        time += by;
    }

    function _blockTimestamp() internal view override returns (uint32 blockTimestamp) {
        blockTimestamp = uint32(time);
    }
}
