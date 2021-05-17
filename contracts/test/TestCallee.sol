// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import {ICallback} from "../PrimitiveEngine.sol";
import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IPrimitiveHouse.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import "../libraries/Margin.sol";
import "../libraries/Position.sol";

contract TestCallee is ICallback, IPrimitiveHouse {
    using SafeERC20 for IERC20;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;

    address public constant NO_CALLER = address(21);

    IERC20 public TX1;
    IERC20 public TY2;
    IPrimitiveEngine public engine;
    IUniswapV3Factory public uniFactory;

    address public CALLER = NO_CALLER;
    Fails public ORDER_TYPE = Fails.NONE;
    uint private reentrant;

    enum Fails { NONE, TX1, TY2 }

    mapping(address => Margin.Data) public _margins;
    mapping(bytes32 => Position.Data) public _positions;

    constructor() {}

    modifier lock() {
        require(reentrant != 1, "locked");
        reentrant = 1;
        _;
        reentrant = 0;
    }

    modifier reset() {
        _;
        ORDER_TYPE = Fails.NONE;
    }

    modifier executionLock() {
        require(reentrant == 1, "Not guarded");
        require(CALLER != NO_CALLER, "No caller set");
        require(address(engine) == msg.sender, "Engine not sender");
        _;
    }

    function initialize(address engine_, address factory_, uint24 fee_) public override {
        require(address(engine) == address(0), "Already initialized");
        engine = IPrimitiveEngine(engine_);
        TX1 = IERC20(engine.TX1());
        TY2 = IERC20(engine.TY2());
    }

    /**
     * @notice Adds deltaX and deltaY to internal balance of `msg.sender`.
     */
    function deposit(address owner, uint deltaX, uint deltaY) public override lock {
        CALLER = msg.sender;
        engine.deposit(msg.sender, deltaX, deltaY);
    }

    function depositFailTX1(uint deltaX, uint deltaY) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TX1;
        engine.deposit(msg.sender, deltaX, deltaY);
    }

    function depositFailTY2(uint deltaX, uint deltaY) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TY2;
        engine.deposit(msg.sender, deltaX, deltaY);
    }

    /**
     * @notice Removes deltaX and deltaY to internal balance of `msg.sender`.
     */
     function withdraw(uint deltaX, uint deltaY) public override lock {
        engine.withdraw(deltaX, deltaY);

        _margins.withdraw(deltaX, deltaY);

        if (deltaX > 0) IERC20(TX1).safeTransfer(CALLER, deltaX);
        if (deltaY > 0) IERC20(TY2).safeTransfer(CALLER, deltaY);
    }

    function repayFromExternal(bytes32 pid, address owner, uint nonce, uint deltaL) public override lock {
        CALLER = msg.sender;
        engine.repay(pid, owner, nonce, deltaL, false);
    }

    function repayFromMargin(bytes32 pid, address owner, uint nonce, uint deltaL) public override lock {
        CALLER = msg.sender;
        (uint deltaX, uint deltaY) = engine.repay(pid, owner, nonce, deltaL, true);

        _margins.withdraw(deltaX, deltaY);

        Position.Data storage pos = _positions.fetch(owner, nonce, pid);
        pos.addLiquidity(deltaL); // Update position liquidity

    }

    function addBothFromMargin(bytes32 pid, address owner, uint nonce, uint deltaL) public override lock {
        CALLER = msg.sender;
        (uint deltaX, uint deltaY) = engine.addBoth(pid, address(this), 0, deltaL, true);

        _margins.withdraw(deltaX, deltaY);

        Position.Data storage pos = _positions.fetch(owner, nonce, pid);
        pos.addLiquidity(deltaL); // Update position liquidity
    }

    function addLiquidityFailTX1(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TX1;
        engine.addBoth(pid, msg.sender, nonce, deltaL, false);
    }

    function addLiquidityFailTY2(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TY2;
        engine.addBoth(pid, msg.sender, nonce, deltaL, false);
    }

    function addBothFromExternal(bytes32 pid, address owner, uint nonce, uint deltaL) public override lock {
        CALLER = msg.sender;
        engine.addBoth(pid, address(this), 0, deltaL, false);

        Position.Data storage pos = _positions.fetch(owner, nonce, pid);
        pos.addLiquidity(deltaL); // Update position liquidity
    }

    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, addXRemoveY, deltaOut, deltaInMax);
    }

    function swapXForY(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, true, deltaOut, type(uint256).max);
    }

    function swapYForX(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, false, deltaOut, type(uint256).max);
    }
    
    /**
     * @notice Puts `deltaL` LP shares up to be borrowed.
     */
    function lend(bytes32 pid, uint nonce, uint deltaL) public override lock {
        CALLER = msg.sender;
        engine.lend(pid, nonce, deltaL);
    }
    
    // ===== Callback Implementations =====
    function addBothFromExternalCallback(uint deltaX, uint deltaY) public override executionLock {
        if(deltaX > 0) IERC20(TX1).safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) IERC20(TY2).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function repayFromExternalCallback(bytes32 pid, address owner, uint nonce, uint deltaL) public override executionLock {
        engine.addBoth(pid, owner, nonce, deltaL, false);
    }

    function removeXYCallback(uint deltaX, uint deltaY) public override executionLock {
        IERC20 TX1 = IERC20(engine.TX1());
        IERC20 TY2 = IERC20(engine.TY2());
        if(deltaX > 0) TX1.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) TY2.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function depositCallback(uint deltaX, uint deltaY) public override {
        if(ORDER_TYPE == Fails.NONE) {
            IERC20 TX1 = IERC20(engine.TX1());
            IERC20 TY2 = IERC20(engine.TY2());
            if(deltaX > 0) TX1.safeTransferFrom(CALLER, msg.sender, deltaX);
            if(deltaY > 0) TY2.safeTransferFrom(CALLER, msg.sender, deltaY);
        } else  {
            // do nothing, will fail early because no tokens were sent into it
        } 
    }

    function swapCallback(uint deltaX, uint deltaY) public override {
        IERC20 TX1 = IERC20(engine.TX1());
        IERC20 TY2 = IERC20(engine.TY2());
        if(deltaX > 0) TX1.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) TY2.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function borrowCallback(Position.Data calldata pos, uint deltaL) public override {
    }
}
