// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../interfaces/IERC3156FlashBorrower.sol";
import "../interfaces/IERC3156FlashLender.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IPrimitiveEngine.sol";

contract FlashAttacker is IERC3156FlashBorrower {
    enum Action {
        NORMAL,
        NOFEE,
        NOTING
    }
    Action private _action;

    struct CallbackData {
        address engine;
        address payer;
        address risky;
        address stable;
    }

    CallbackData private callbackData;
    bytes private empty;

    function flashBorrow(
        IERC3156FlashLender lender,
        address token,
        uint256 amount,
        Action action,
        bytes calldata data
    ) external {
        _action = action;
        lender.flashLoan(this, token, amount, data);
        IPrimitiveEngine eng = IPrimitiveEngine(address(lender));
        address rs = eng.risky();
        eng.withdraw(token == rs ? amount : 0, token == rs ? 0 : amount);
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
            IPrimitiveEngine engine = IPrimitiveEngine(msg.sender);
            uint256 delRisky;
            uint256 delStable;
            (address risky, address stable) = (engine.risky(), engine.stable());
            IERC20(risky).approve(msg.sender, type(uint256).max);
            IERC20(stable).approve(msg.sender, type(uint256).max);
            if (token == risky) {
                delRisky = amount + fee;
            } else {
                delStable = amount + fee;
            }
            callbackData = CallbackData({engine: msg.sender, payer: address(this), risky: risky, stable: stable});
            engine.deposit(initiator, delRisky, delStable, data);
            //IERC20(token).transfer(msg.sender, amount + fee);
        } else if (_action == Action.NOFEE) {
            IERC20(token).transfer(msg.sender, amount);
        }

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        data;
        require(callbackData.engine == msg.sender, "Not engine");
        if (delRisky > 0) IERC20(callbackData.risky).transfer(msg.sender, delRisky);
        if (delStable > 0) IERC20(callbackData.stable).transfer(msg.sender, delStable);
    }
}
