// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../interfaces/IERC20.sol";

library Transfers {
    /// @notice Performs an ERC20 `transfer` call and checks return data
    function safeTransfer(IERC20 token, address to, uint value) internal returns (bool) {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(success && (returnData.length == 0 || abi.decode(returnData, (bool))), "Transfer fail");  
    }
}