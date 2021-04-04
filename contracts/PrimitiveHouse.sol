// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;


import {ICallback} from "./PrimitiveEngine.sol";
import "./IPrimitiveEngine.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PrimitiveHouse is ICallback {
    using SafeERC20 for IERC20;

    address public constant NO_CALLER = address(21);
    IPrimitiveEngine public engine;

    address public CALLER = NO_CALLER;
    uint private reentrant;

    constructor() {}

    modifier lock() {
        require(reentrant != 1, "locked");
        reentrant = 1;
        _;
        reentrant = 0;
    }

    modifier executionLock() {
        require(reentrant == 1, "Not guarded");
        require(CALLER != NO_CALLER, "No caller set");
        require(address(engine) == msg.sender, "Engine not sender");
        _;
    }

    function initialize(address engine_) public {
        require(address(engine) == address(0), "Already initialized");
        engine = IPrimitiveEngine(engine_);
    }

    function deposit(uint nonce, uint deltaX, uint deltaY) public lock {
        CALLER = msg.sender;
        engine.deposit(msg.sender, nonce, deltaX, deltaY);
    }

    function withdraw(uint nonce, uint deltaX, uint deltaY) public lock {
        CALLER = msg.sender;
        engine.withdraw(msg.sender, nonce, deltaX, deltaY);
    }

    function addLiquidity(bytes32 pid, uint nonce, uint deltaL) public lock {
        CALLER = msg.sender;
        engine.addBoth(pid, msg.sender, nonce, deltaL);
    }
    
    // ===== Callback Implementations =====
    function addXYCallback(uint deltaX, uint deltaY) public override executionLock {
        IERC20 TX1 = IERC20(engine.TX1());
        IERC20 TY2 = IERC20(engine.TY2());
        if(deltaX > 0) TX1.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) TY2.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function removeXYCallback(uint deltaX, uint deltaY) public override executionLock {
        IERC20 TX1 = IERC20(engine.TX1());
        IERC20 TY2 = IERC20(engine.TY2());
        if(deltaX > 0) TX1.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) TY2.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function depositCallback(uint deltaX, uint deltaY) public override {
        addXYCallback(deltaX, deltaY);
    }

    function addXCallback(uint deltaX, uint deltaY) public override {
        addXYCallback(deltaX, deltaY);
    }

    function removeXCallback(uint deltaX, uint deltaY) public override {
        addXYCallback(deltaX, deltaY);
    }

    function withdrawCallback(uint deltaX, uint deltaY) public override executionLock returns (address) {
        return CALLER;
    }

    function getCaller() public view override returns (address) {
        return CALLER;
    }

}