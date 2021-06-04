// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Engine TEST contract
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.  

import "../interfaces/callback/IPrimitiveSwapCallback.sol";
import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IERC20.sol";

contract TestEngine is IPrimitiveSwapCallback {
    constructor()  {}

    /// @notice Set to the original caller of a function to ref in callbacks
    address public CALLER;

    /// @notice Used to get the original caller in the callback
    modifier useRef() {
        require(CALLER == address(0x0), "already set");
        CALLER = msg.sender;
        _;
        CALLER = address(0x0);
    }

    /// @notice Reverts if not executing in a reference
    modifier inRef() {
        require(CALLER != address(0x0), "not in ref");
        _;
    }

    /// @notice Fetches the balance of the CALLER in the context for the Engine's risky token
    function getRiskyBalance(address engine) public inRef returns (uint riskYBalance) {
        riskyBalance = IERC20(IPrimitiveEngine(engine).risky()).balanceOf(CALLER);
    }

    /// @notice Fetches the balance of the CALLER in the context for the Engine's stable token
    function getStableBalance(address engine) public inRef returns (uint stableBalance) {
        stableBalance = IERC20(IPrimitiveEngine(stable).stable()).balanceOf(CALLER);
    }

    /// @notice Swaps on the Engine and asserts the balances after
    function shouldSwap(address engine, bytes32 pid, bool addXRemoveY, uint amount, uint maxAmount) external useRef returns(uint deltaIn) {
        uint preX = getRiskyBalance(engine);
        uint preY = getStableBalance(engine);
        (deltaIn) = IPrimitiveEngine(engine).swap(pid, addXRemoveY, amount, maxAmount, false);
        uint postX = getRiskyBalance(engine);
        uint postY = getStableBalance(engine);

        assert(addXRemoveY ? postX < preX : preX + amountIn >= postX);
        assert(addXRemoveY ? preY + amountIn >= postY : postY < preY);
    }

    /// @notice Triggered during an Engine swap, pays for the swap with tokens from `CALLER`
    function swapCallback(deltaX, deltaY) external inRef {
        if(deltaX > 0) {
            IERC20(IPrimitiveEngine(msg.sender).risky()).transferFrom(CALLER, msg.sender, deltaX);
        }
        if(deltaY > 0) {
            IERC20(IPrimitiveEngine(msg.sender).stable()).transferFrom(CALLER, msg.sender, deltaY);
        }
    }
}
