// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveHouse.sol";
import "./libraries/Position.sol";
import "./libraries/Margin.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "hardhat/console.sol";

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

    function create(uint strike, uint sigma, uint time, uint riskyPrice, bytes calldata data) public override lock useCallerContext {
      engine.create(strike, sigma, time, riskyPrice, 1e18, data);
    }

    /**
     * @notice Adds deltaX and deltaY to internal balance of `msg.sender`.
     */
    function deposit(address owner, uint deltaX, uint deltaY, bytes calldata data) public override lock useCallerContext {
        engine.deposit(address(this), deltaX, deltaY, data);

        // Update Margin state
        Margin.Data storage mar = _margins[owner];
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
    function allocateFromMargin(bytes32 pid, address owner, uint deltaL, bytes calldata data) public override lock useCallerContext {
        (uint deltaX, uint deltaY) = engine.allocate(pid, address(this),  deltaL, true, data);

        _margins.withdraw(deltaX, deltaY);
        Position.Data storage pos = _positions.fetch(owner, pid);
        pos.allocate(deltaL); // Update position liquidity
    }

    function allocateFromExternal(bytes32 pid, address owner, uint deltaL, bytes calldata data) public override lock useCallerContext {
        engine.allocate(pid, address(this),  deltaL, false, data);

        Position.Data storage pos = _positions.fetch(owner, pid);
        pos.allocate(deltaL); // Update position liquidity
    }

    function repayFromExternal(bytes32 pid, address owner, uint deltaL, bytes calldata data) public override lock useCallerContext {
        (uint deltaRisky,) = engine.repay(pid, address(this), deltaL, false, data);

        Position.Data storage pos = _positions.fetch(owner, pid);
        pos.repay(deltaL);
        
        Margin.Data storage mar = _margins[owner];
        mar.deposit(deltaL - deltaRisky, uint(0));

    }

    function repayFromMargin(bytes32 pid, address owner,  uint deltaL, bytes calldata data) public override lock useCallerContext {
        (uint deltaRisky,) = engine.repay(pid, address(this), deltaL, true, data);


        Position.Data storage pos = _positions.fetch(owner, pid);
        pos.repay(deltaL);

        Margin.Data storage mar = _margins[owner];
        mar.deposit(deltaL - deltaRisky, uint(0));

    }

    function borrow(bytes32 pid, address owner, uint deltaL, bytes calldata data) public override lock useCallerContext {
      engine.borrow(pid, address(this), deltaL, type(uint256).max, data);
      
      _positions.borrow(pid, deltaL);
    }
    
    /**
     * @notice Puts `deltaL` LP shares up to be borrowed.
     */
    function lend(bytes32 pid, uint deltaL) public override lock useCallerContext {
        engine.lend(pid, deltaL);

        _positions.lend(pid, deltaL);
    }

    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax, bytes calldata data) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, addXRemoveY, deltaOut, deltaInMax, true, data);
    }

    function swapXForY(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, true, deltaOut, type(uint256).max, true, new bytes(0));
    }

    function swapYForX(bytes32 pid, uint deltaOut) public override lock {
        CALLER = msg.sender;
        engine.swap(pid, false, deltaOut, type(uint256).max, true, new bytes(0));
    }
    
    // ===== Callback Implementations =====
    function createCallback(uint deltaX, uint deltaY, bytes calldata data) public override executionLock {
        if (deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function depositCallback(uint deltaX, uint deltaY, bytes calldata data) public override executionLock {
        if (deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function allocateCallback(uint deltaX, uint deltaY, bytes calldata data) public override executionLock {
        if(deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function removeCallback(uint deltaX, uint deltaY, bytes calldata data) public override executionLock {
        if(deltaX > 0) IERC20(engine.risky()).safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) IERC20(engine.stable()).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function swapCallback(uint deltaX, uint deltaY, bytes calldata data) public override {
    }

    function borrowCallback(uint deltaL, uint deltaX, uint deltaY, bytes calldata data) public override executionLock {
      uint preBY2 = stable.balanceOf(address(this));

      bytes memory placeholder = "0x";

      uint riskyNeeded = deltaL - deltaX;
      IERC20(engine.risky()).safeTransferFrom(CALLER, msg.sender, riskyNeeded);
      IERC20(engine.stable()).safeTransfer(CALLER, deltaY);

      uint postBY2 = stable.balanceOf(address(this));
      require(postBY2 >= preBY2 - deltaY);
/*
      bool zeroForOne = stable > risky ? true : false;
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
    */
    }

    function repayFromExternalCallback(uint deltaStable, bytes calldata data) public override {
      IERC20(engine.stable()).safeTransferFrom(CALLER, msg.sender, deltaStable);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata date) external {

    }

    /// @notice Returns the internal balances of risky and riskless tokens for an owner
    function margins(address owner) public override view returns (Margin.Data memory mar) {
        mar = _margins[owner];
    }

    function getPosition(address owner, bytes32 pid) public view returns (Position.Data memory pos) {
        pos = _positions[keccak256(abi.encodePacked(address(this), owner, pid))];
    }
}
