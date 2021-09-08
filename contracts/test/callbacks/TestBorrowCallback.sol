// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";
import "./Scenarios.sol";

abstract contract TestBorrowCallback is Scenarios {
    function borrowCallback(
        uint256 riskyDeficit,
        uint256 stableDeficit,
        bytes calldata data
    ) public {
        data;
        if (scenario == Scenario.FAIL) return;
        if (scenario == Scenario.REENTRANCY)
            IPrimitiveEngine(msg.sender).borrow(bytes32(0), riskyDeficit, stableDeficit, false, data);
        address token0 = risky();
        address token1 = stable();
        address from = getCaller();
        if (riskyDeficit > 0) IERC20(token0).transferFrom(from, msg.sender, riskyDeficit);
        if (stableDeficit > 0) IERC20(token1).transferFrom(from, msg.sender, stableDeficit);
        IERC20(token0).transfer(from, IERC20(token0).balanceOf(address(this)));
        IERC20(token1).transfer(from, IERC20(token1).balanceOf(address(this)));
    }
}
