// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../interfaces/IERC3156FlashBorrower.sol";
import "../interfaces/IERC3156FlashLender.sol";
import "../interfaces/IERC20.sol";

contract FlashBorrower is IERC3156FlashBorrower {
    enum Action {
        NORMAL,
        NOFEE,
        NOTING
    }
    Action private _action;

    function flashBorrow(
        IERC3156FlashLender lender,
        address token,
        uint256 amount,
        Action action,
        bytes calldata data
    ) external {
        _action = action;
        lender.flashLoan(this, token, amount, data);
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        initiator;
        data;

        if (_action == Action.NORMAL) {
            IERC20(token).transfer(msg.sender, amount + fee);
        } else if (_action == Action.NOFEE) {
            IERC20(token).transfer(msg.sender, amount);
        }

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
