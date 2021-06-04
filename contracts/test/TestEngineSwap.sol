// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Engine TEST contract
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.  

import "../interfaces/callback/IPrimitiveSwapCallback.sol";
import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IERC20.sol";

import "./useRef.sol";

contract TestEngineSwap is IPrimitiveSwapCallback, useRef {
    constructor()  {}

    /// @notice Caller ref
    address public CALLER;


    /// @notice Fetches the balance of the CALLER in the context for the Engine's risky token
    function getRiskyBalance(address engine) public inRef returns (uint riskyBalance) {
        riskyBalance = IERC20(IPrimitiveEngine(engine).risky()).balanceOf(CALLER);
    }

    /// @notice Fetches the balance of the CALLER in the context for the Engine's stable token
    function getStableBalance(address engine) public inRef returns (uint stableBalance) {
        stableBalance = IERC20(IPrimitiveEngine(engine).stable()).balanceOf(CALLER);
    }

    function create(address engine, uint strike, uint sigma, uint time, uint spot) external useRef(setCaller()) {
        IPrimitiveEngine(engine).create(strike, sigma, time, spot);
    }

    /// @notice Swaps on the Engine and asserts the balances after
    function shouldSwap(address engine, bytes32 pid, bool addXRemoveY, uint amount, uint maxAmount) external useRef(setCaller()) returns(uint deltaIn) {
        uint preX = getRiskyBalance(engine);
        uint preY = getStableBalance(engine);
        (deltaIn) = IPrimitiveEngine(engine).swap(pid, addXRemoveY, amount, maxAmount, false);
        uint postX = getRiskyBalance(engine);
        uint postY = getStableBalance(engine);

        assert(addXRemoveY ? postX < preX : preX + deltaIn >= postX);
        assert(addXRemoveY ? preY + deltaIn >= postY : postY < preY);
    }

    /// @notice Triggered during an Engine swap, pays for the swap with tokens from `CALLER`
    function swapCallback(uint deltaX, uint deltaY) external override inRef {
        if(deltaX > 0) {
            IERC20(IPrimitiveEngine(msg.sender).risky()).transferFrom(CALLER, msg.sender, deltaX);
        }
        if(deltaY > 0) {
            IERC20(IPrimitiveEngine(msg.sender).stable()).transferFrom(CALLER, msg.sender, deltaY);
        }
    } 

    function createCallback(uint deltaX, uint deltaY) external inRef {
        if(deltaX > 0) {
            IERC20(IPrimitiveEngine(msg.sender).risky()).transferFrom(CALLER, msg.sender, deltaX);
        }
        if(deltaY > 0) {
            IERC20(IPrimitiveEngine(msg.sender).stable()).transferFrom(CALLER, msg.sender, deltaY);
        }
    }

    // ===== useRef =====

    function setCaller() public returns (bytes memory data) {
        data = abi.encode(msg.sender);
    }

    function useRefCallback(bytes calldata data) public override {
        CALLER = abi.decode(data, (address));
    }

    function useClearRefCallback() public override inRef {
        CALLER = address(0x0);
    } 

    function useInRefCallback() public override returns (bool) {
        return CALLER != address(0x0);
    }
}
