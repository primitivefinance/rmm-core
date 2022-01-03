// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.6.0;

import "../interfaces/IERC20.sol";

/// @title  Transfers
library Transfers {
    /// @notice         Performs an ERC20 `transfer` call and checks return data
    /// @param  token   ERC20 token to transfer
    /// @param  to      Recipient of the ERC20 token
    /// @param  value   Amount of ERC20 to transfer
    function safeTransfer(
        IERC20 token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory returnData) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(success && (returnData.length == 0 || abi.decode(returnData, (bool))), "Transfer fail");
    }
}
