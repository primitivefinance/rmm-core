// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../interfaces/IERC3156FlashBorrower.sol";
import "../interfaces/IERC3156FlashLender.sol";
import "../interfaces/IERC20.sol";

import "hardhat/console.sol";

contract FlashBorrower is IERC3156FlashBorrower {
    function flashLoan(
        IERC3156FlashLender lender,
        address token,
        uint256 amount,
        bytes calldata data
    ) external {
        lender.flashLoan(this, token, amount, data);
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        console.log("Flash loan of %s, fee %s", amount, fee);
        IERC20(token).transfer(msg.sender, amount + fee);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
