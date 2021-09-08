// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";
import "./Scenarios.sol";

abstract contract TestDepositCallback is Scenarios {
    function depositCallback(
        uint256 dRisky,
        uint256 dStable,
        bytes calldata data
    ) public {
        data;
        if (scenario == Scenario.FAIL) return;
        address token0 = risky();
        address token1 = stable();
        address from = getCaller();
        if (scenario == Scenario.RISKY_ONLY) {
            IERC20(token0).transferFrom(from, msg.sender, dRisky);
        } else if (scenario == Scenario.STABLE_ONLY) {
            IERC20(token1).transferFrom(from, msg.sender, dStable);
        } else if (scenario == Scenario.SUCCESS) {
            IERC20(token0).transferFrom(from, msg.sender, dRisky);
            IERC20(token1).transferFrom(from, msg.sender, dStable);
        } else if (scenario == Scenario.REENTRANCY) {
            IPrimitiveEngine(msg.sender).deposit(address(this), dRisky, dStable, data);
        }
    }
}
