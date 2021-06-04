// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   High-level Test contract for calling into the PrimitiveEngine
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.

import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IPrimitiveHouse.sol";
import "../libraries/Margin.sol";
import "../libraries/Position.sol";
import "../libraries/Transfers.sol";
import "./TestUniswapCallee.sol";


contract TestCallee is TestUniswapCallee {
    using Transfers for IERC20; // safeTransfer
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;

    /// @notice Different failure cases
    enum Fails { NONE, TX1, TY2 }

    /// @notice Original caller context is set to NO_CALLER when not executing
    address public constant NO_CALLER = address(21);

    /// @notice A risky token like WETH
    IERC20 public risky;
    /// @notice A stable token like DAI
    IERC20 public stable;
    /// @notice The Primitive Engine core contract
    IPrimitiveEngine public engine;
    /// @notice Uniswap V3 factory
    IUniswapV3Factory public uniFactory;
    /// @notice Stores the orgiinal caller of this contract's functions to ref in callbacks
    address public CALLER = NO_CALLER;
    /// @notice Used to trigger different failure cases in the callbacks
    Fails public ORDER_TYPE = Fails.NONE;
    /// @dev Standard mutex
    uint private reentrant;
    /// @notice This contract's own margin state. This contract will have its own margin acc w/ the Engine
    mapping(address => Margin.Data) public _margins;
    /// @notice This contract's own position state. This contract has its own positions w/ the Engine
    mapping(bytes32 => Position.Data) public _positions;

    constructor() {}

    /// @notice Reentrancy guard
    modifier lock() {
        require(reentrant != 1, "locked");
        reentrant = 1;
        _;
        reentrant = 0;
    }

    /// @notice Sets caller refs
    modifier useCallerContext() {
      require(CALLER == NO_CALLER, "CSF"); // Caller set failure
      CALLER = msg.sender;
      _;
      CALLER = NO_CALLER;
    }

    /// @notice Resets failure case refs
    modifier reset() {
        _;
        ORDER_TYPE = Fails.NONE;
        
    }

    /// @notice Modifer for callbacks to only be called during an execution of the public fns
    modifier executionLock() {
        require(reentrant == 1, "Not guarded");
        require(CALLER != NO_CALLER, "No caller set");
        require(address(engine) == msg.sender, "Engine not sender");
        _;
    }

    /// @notice Sets up the engine and tokens for this high-level contract
    function initialize(address engine_, address factory_, uint24 fee_) public {
        require(address(engine) == address(0), "Already initialized");
        engine = IPrimitiveEngine(engine_);
        risky = IERC20(engine.risky());
        stable = IERC20(engine.stable());
    }

    /// @notice Initializes a new pool with these params. Uses spot price `riskyPrice` to determine initial reserves.
    function create(uint strike, uint sigma, uint time, uint riskyPrice) public lock useCallerContext {
      CALLER = msg.sender;
      engine.create(strike, sigma, time, riskyPrice); // will trigger a callback
    }

    function deposit(address owner, uint deltaX, uint deltaY) public lock {
        CALLER = msg.sender;
        engine.deposit(msg.sender, deltaX, deltaY); // will trigger a callback
    }

    /// @notice Fails in the depositCallback because no risky tokens are sent as deposit
    function depositFailTX1(uint deltaX, uint deltaY) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TX1;
        engine.deposit(msg.sender, deltaX, deltaY);
    }

    /// @notice Fails in the depositCallback because no stable tokens are sent as deposit
    function depositFailTY2(uint deltaX, uint deltaY) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TY2;
        engine.deposit(msg.sender, deltaX, deltaY);
    }

    /// @notice Removes deltaX and deltaY to internal balance of `msg.sender`.
     function withdraw(uint deltaX, uint deltaY) public lock {
        CALLER = msg.sender;
        engine.withdraw(deltaX, deltaY);
        _margins.withdraw(deltaX, deltaY);

        if (deltaX > 0) IERC20(risky).safeTransfer(CALLER, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransfer(CALLER, deltaY);
    }

    /// @notice Triggers the repayCallback to spend tokens from balance
    function repayFromExternal(bytes32 pid, address owner,  uint deltaL) public lock {
        CALLER = msg.sender;
        engine.repay(pid, owner, deltaL, false);
    }

    /// @notice Uses margin balance in the Engine to repay debt
    function repayFromMargin(bytes32 pid, address owner, uint deltaL) public lock {
        CALLER = msg.sender;
        (uint deltaX, uint deltaY) = engine.repay(pid, owner, deltaL, true); // call repay

        _margins.withdraw(deltaX, deltaY); // take out any profits

        Position.Data storage pos = _positions.fetch(address(this), owner, pid);
        pos.allocate(deltaL); // Update position liquidity

    }

    /// @notice Uses margin balance to add liquidity to a `pid`
    function allocateFromMargin(bytes32 pid, address owner, uint deltaL) public lock {
        bytes32 pid_ = pid;
        (uint deltaX, uint deltaY) = engine.allocate(pid_, address(this),  deltaL, true);

        _margins.withdraw(deltaX, deltaY);
        Position.Data storage pos = _positions.fetch(address(this), owner, pid_);
        pos.allocate(deltaL); // Update position liquidity
    }

    /// @notice Pays tokens in the allocateCallback as liquidity to the `pid`
    function allocateFromExternal(bytes32 pid, address owner, uint deltaL) public lock {
        bytes32 pid_ = pid;
        engine.allocate(pid_, address(this),  deltaL, false);
        Position.Data storage pos = _positions.fetch(address(this), owner, pid_);
        pos.allocate(deltaL); // Update position liquidity
    }

    /// @notice Allocates liquidity to a curve but fails to pay in callback because no risky tokens
    function allocateFailRisky(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TX1;
        engine.allocate(pid, msg.sender, deltaL, false);
    }

    /// @notice Allocates liquidity to a curve but fails to pay in callback because no stable tokens
    function allocateFailStable(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TY2;
        engine.allocate(pid, msg.sender, deltaL, false);
    }

    /// @notice Executes an Engine swap
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) public lock {
        CALLER = msg.sender;
        engine.swap(pid, addXRemoveY, deltaOut, deltaInMax, true);
    }

    /// @notice Swaps the risky tokens for stable tokens in the Engine
    function swapRiskyForStable(bytes32 pid, uint deltaOut) public lock {
        CALLER = msg.sender;
        engine.swap(pid, true, deltaOut, type(uint256).max, true);
    }

    /// @notice Swaps stable tokens for the risky in the Engine
    function swapStableForRisky(bytes32 pid, uint deltaOut) public lock {
        CALLER = msg.sender;
        engine.swap(pid, false, deltaOut, type(uint256).max, true);
    }
    
    /// @notice Initiates a liquidity loan through the Engine
    function lend(bytes32 pid, uint deltaL) public lock {
        CALLER = msg.sender;
        engine.lend(pid, deltaL);
    }

    /// @notice Initiates a borrowed position with the Engine
    function borrow(bytes32 pid, address owner, uint deltaL) public lock {
      CALLER = msg.sender;
      engine.borrow(pid, address(this), deltaL, type(uint256).max);
      _positions.borrow(address(this), pid, deltaL);
      CALLER = NO_CALLER;
    }
    
    // ===== Callback Implementations =====

    /// @notice Uses the `CALLER` context to pay tokens during callbacks.
    /// @dev    WARNING: Unsafe pattern, only used for testing
    function _transferFromContext(IERC20 token, uint amount) internal {
        require(CALLER != address(0x0), "CALLER not set");
        if(amount > 0) token.transferFrom(CALLER, msg.sender, amount);
    }

    /// @notice Triggered on a new pool being created
    function createCallback(uint deltaX, uint deltaY) public executionLock {
        _transferFromContext(risky, deltaX);
        _transferFromContext(stable, deltaY);
    }

    /// @notice Triggered when providing liquidity to a curve
    function allocateCallback(uint deltaX, uint deltaY) public executionLock {
        _transferFromContext(risky, deltaX);
        _transferFromContext(stable, deltaY);
    }

    function repayFromExternalCallback(uint deltaStable) public {
        _transferFromContext(stable, deltaStable);
    }

    /// @notice Triggered when removing liquidity
    function removeCallback(uint deltaX, uint deltaY) public executionLock {
        _transferFromContext(risky, deltaX);
        _transferFromContext(stable, deltaY);
    }

    /// @notice Triggered when adding to margin balance
    function depositCallback(uint deltaX, uint deltaY) public {
        if(ORDER_TYPE == Fails.NONE) {
            _transferFromContext(risky, deltaX);
            _transferFromContext(stable, deltaY);
        }
    }

    /// @notice Triggered during an engine.swap() call which allows us to pay the swap
    /// @dev    CALLER is set before engine.swap() is called so it can be referenced here
    ///         `msg.sender` should be the engine.
    function swapCallback(uint deltaX, uint deltaY) public {
        _transferFromContext(risky, deltaX);
        _transferFromContext(stable, deltaY);
    }

    /// @notice TODO: Delete this?
    function borrowCallback(uint deltaL, uint deltaX, uint deltaY) public {
    }

    /// @notice Returns the internal balances of risky and riskless tokens for an owner
    function margins(address owner) public view returns (Margin.Data memory mar) {
        mar = _margins[owner];
    }
}
