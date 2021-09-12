// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";
import "./Scenarios.sol";

abstract contract TestCreateCallback is Scenarios {
    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        data;
        address token0 = risky();
        address token1 = stable();
        address from = getCaller();
        IERC20(token0).transferFrom(from, msg.sender, delRisky);
        IERC20(token1).transferFrom(from, msg.sender, delStable);
    }
}
