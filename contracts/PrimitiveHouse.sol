// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveHouse.sol";
import "./libraries/Position.sol";
import "./libraries/Margin.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

contract PrimitiveHouse is IPrimitiveHouse {
    using SafeERC20 for IERC20;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;

    address public constant NO_CALLER = address(21);

    IPrimitiveEngine public engine;

    IERC20 public risky;
    IERC20 public stable;
    IUniswapV3Factory public uniFactory;
    IUniswapV3Pool public uniPool;

    address public CALLER = NO_CALLER;
    uint private reentrant;

    mapping(address => Margin.Data) public _margins;
    mapping(bytes32 => Position.Data) public _positions;

    constructor() {}

    modifier lock() {
        require(reentrant != 1, "locked");
        reentrant = 1;
        _;
        reentrant = 0;
    }

    modifier useCallerContext() {
      require(CALLER == NO_CALLER, "CSF"); // Caller set failure
      CALLER = msg.sender;
      _;
      CALLER = NO_CALLER;
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
        risky = IERC20(engine.risky());
        stable = IERC20(engine.stable());
        uniFactory = IUniswapV3Factory(factory_); 
        uniPool = IUniswapV3Pool(uniFactory.getPool(address(risky), address(stable), fee_));
        require(address(uniPool) != address(0), "POOL UNINITIALIZED");
    }

    function create(uint strike, uint sigma, uint time, uint riskyPrice) public override lock useCallerContext {
      engine.create(strike, sigma, time, riskyPrice);
    }

    /**
     * @notice Adds deltaX and deltaY to internal balance of `msg.sender`.
     */
    function deposit(address owner, uint deltaX, uint deltaY) public override lock useCallerContext {
        engine.deposit(address(this), deltaX, deltaY);

        // Update Margin state
        Margin.Data storage mar = _margins.fetch(owner);
        mar.deposit(deltaX, deltaY);
    }

    /**
     * @notice Removes deltaX and deltaY to internal balance of `msg.sender`.
     */
    function withdraw(uint deltaX, uint deltaY) public override lock useCallerContext {
        engine.withdraw(deltaX, deltaY);

        _margins.withdraw(deltaX, deltaY);

        if (deltaX > 0) IERC20(risky).safeTransfer(CALLER, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransfer(CALLER, deltaY);
    }

    /**
     * @notice Adds deltaL to global liquidity factor.
     */
    function allocateFromMargin(bytes32 pid, address owner, uint deltaL) public override lock useCallerContext {
        (uint deltaX, uint deltaY) = engine.allocate(pid, address(this),  deltaL, true);

        _margins.withdraw(deltaX, deltaY);
        address factory = engine.factory();
        Position.Data storage pos = _positions.fetch(factory, owner, pid);
        pos.allocate(deltaL); // Update position liquidity
    }

    function allocateFromExternal(bytes32 pid, address owner, uint deltaL) public override lock useCallerContext {
        engine.allocate(pid, address(this),  deltaL, false);

        address factory = engine.factory();
        Position.Data storage pos = _positions.fetch(factory, owner, pid);
        pos.allocate(deltaL); // Update position liquidity
    }

    function repayFromExternal(bytes32 pid, address owner, uint deltaL) public override lock useCallerContext {
        engine.repay(pid, owner, deltaL, false);
    }

    function repayFromMargin(bytes32 pid, address owner,  uint deltaL) public override lock useCallerContext {
        (uint deltaX, uint deltaY) = engine.repay(pid, owner, deltaL, true);

        _margins.withdraw(deltaX, deltaY);

        address factory = engine.factory();
        Position.Data storage pos = _positions.fetch(factory, owner, pid);
        pos.allocate(deltaL); // Update position liquidity
    }

    function borrow(bytes32 pid, address owner, uint deltaL) public override lock useCallerContext {
      engine.borrow(pid, address(this), deltaL, type(uint256).max);
      
      address factory = engine.factory();
      Position.Data storage pos = _positions.borrow(factory, pid, deltaL);
    }
    
    /**
     * @notice Puts `deltaL` LP shares up to be borrowed.
     */
    function lend(bytes32 pid, uint deltaL) public override lock useCallerContext {
        engine.lend(pid, deltaL);
        
        // cant use callback, must maintain msg.sender
        if (deltaL > 0) {
            // increment position float factor by `deltaL`
            _positions.lend(engine.factory(), pid, deltaL);
        } 
    }

    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, addXRemoveY, deltaOut, deltaInMax, true);
    }

    function swapXForY(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, true, deltaOut, type(uint256).max, true);
    }

    function swapYForX(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, false, deltaOut, type(uint256).max, true);
    }
    
    // ===== Callback Implementations =====
    function createCallback(uint deltaX, uint deltaY) public override executionLock {
        if (deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function depositCallback(uint deltaX, uint deltaY) public override executionLock {
        if (deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function allocateCallback(uint deltaX, uint deltaY) public override executionLock {
        if(deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function removeCallback(uint deltaX, uint deltaY) public override executionLock {
        IERC20 risky = IERC20(engine.risky());
        IERC20 stable = IERC20(engine.stable());
        if(deltaX > 0) risky.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) stable.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function swapCallback(uint deltaX, uint deltaY) public override {
    }

    function borrowCallback(uint deltaL, uint deltaX, uint deltaY) public override executionLock {
      uint preBY2 = stable.balanceOf(address(this));


      bytes memory placeholder = '0x';

      bool zeroForOne = stable > risky ? false : true;

      (int256 res0, int256 res1) = uniPool.swap(
        address(this),
        zeroForOne,
        int256(deltaY),
        uint160(0),
        placeholder
      );

      uint riskyNeeded = zeroForOne ? deltaL - (deltaX + uint(res0)) : deltaL - (deltaX + uint(res1));
      risky.safeTransferFrom(CALLER, msg.sender, riskyNeeded);
      risky.safeTransfer(
        msg.sender,
        zeroForOne ? uint(res0) : uint(res1)
     );
      uint postBY2 = stable.balanceOf(address(this));
      require(postBY2 >= preBY2 - deltaY);
    }

    function repayFromExternalCallback(bytes32 pid, address owner,  uint deltaL) public override {
    }

    /// @notice Returns the internal balances of risky and riskless tokens for an owner
    function getMargin(address owner) public override view returns (Margin.Data memory mar) {
        mar = _margins[owner];
    }
}
