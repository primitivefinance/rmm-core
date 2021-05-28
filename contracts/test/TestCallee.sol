// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IPrimitiveHouse.sol";
import "../libraries/Margin.sol";
import "../libraries/Position.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import '@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol';

import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol';

contract TestCallee is IPrimitiveHouse {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;

    address public constant NO_CALLER = address(21);

    IERC20 public risky;
    IERC20 public stable;
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
        risky = IERC20(engine.risky());
        stable = IERC20(engine.stable());
    }

    /**
     * @notice Adds deltaX and deltaY to internal balance of `msg.sender`.
     */
    function create(uint strike, uint sigma, uint time, uint riskyPrice) public override executionLock {
      engine.create(strike, sigma, time, riskyPrice);
    }

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

        if (deltaX > 0) IERC20(risky).safeTransfer(CALLER, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransfer(CALLER, deltaY);
    }

    function repayFromExternal(bytes32 pid, address owner,  uint deltaL) public override lock {
        CALLER = msg.sender;
        engine.repay(pid, owner, deltaL, false);
    }

    function repayFromMargin(bytes32 pid, address owner, uint deltaL) public override lock {
        CALLER = msg.sender;
        (uint deltaX, uint deltaY) = engine.repay(pid, owner, deltaL, true);

        _margins.withdraw(deltaX, deltaY);

        Position.Data storage pos = _positions.fetch(address(this), owner, pid);
        pos.allocate(deltaL); // Update position liquidity

    }

    function allocateFromMargin(bytes32 pid, address owner, uint deltaL) public override lock {
        bytes32 pid_ = pid;
        (uint deltaX, uint deltaY) = engine.allocate(pid_, address(this),  deltaL, true);

        _margins.withdraw(deltaX, deltaY);
        address factory = engine.factory();
        Position.Data storage pos = _positions.fetch(address(this), owner, pid_);
        pos.allocate(deltaL); // Update position liquidity
    }

    function allocateFromExternal(bytes32 pid, address owner, uint deltaL) public override lock {
        bytes32 pid_ = pid;
        engine.allocate(pid_, address(this),  deltaL, false);

        address factory = engine.factory();
        Position.Data storage pos = _positions.fetch(address(this), owner, pid_);
        pos.allocate(deltaL); // Update position liquidity
    }


    function addLiquidityFailTX1(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TX1;
        engine.allocate(pid, msg.sender, deltaL, false);
    }

    function addLiquidityFailTY2(bytes32 pid, uint nonce, uint deltaL) public lock reset {
        CALLER = msg.sender;
        ORDER_TYPE = Fails.TY2;
        engine.allocate(pid, msg.sender, deltaL, false);
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
    
    /**
     * @notice Puts `deltaL` LP shares up to be borrowed.
     */
    function lend(bytes32 pid, uint deltaL) public override lock {
        CALLER = msg.sender;
        engine.lend(pid, deltaL);
    }

    function borrow(bytes32 pid, address owner, uint deltaL) public override lock {
      CALLER = msg.sender;
      engine.borrow(pid, address(this), deltaL, type(uint256).max);
      
      address factory = engine.factory();
      Position.Data storage pos = _positions.borrow(address(this), pid, deltaL);
      CALLER = NO_CALLER;
    }
    
    // ===== Callback Implementations =====
    function createCallback(uint deltaX, uint deltaY) public override executionLock {
        if (deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if (deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function allocateCallback(uint deltaX, uint deltaY) public override executionLock {
        if(deltaX > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function repayFromExternalCallback(bytes32 pid, address owner, uint deltaL) public override executionLock {
        engine.allocate(pid, owner, deltaL, false);
    }

    function removeCallback(uint deltaX, uint deltaY) public override executionLock {
        IERC20 risky = IERC20(engine.risky());
        IERC20 stable = IERC20(engine.stable());
        if(deltaX > 0) risky.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) stable.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function depositCallback(uint deltaX, uint deltaY) public override {
        if(ORDER_TYPE == Fails.NONE) {
            IERC20 risky = IERC20(engine.risky());
            IERC20 stable = IERC20(engine.stable());
            if(deltaX > 0) risky.safeTransferFrom(CALLER, msg.sender, deltaX);
            if(deltaY > 0) stable.safeTransferFrom(CALLER, msg.sender, deltaY);
        } else  {
            // do nothing, will fail early because no tokens were sent into it
        } 
    }

    function swapCallback(uint deltaX, uint deltaY) public override {
        IERC20 risky = IERC20(engine.risky());
        IERC20 stable = IERC20(engine.stable());
        if(deltaX > 0) risky.safeTransferFrom(CALLER, msg.sender, deltaX);
        if(deltaY > 0) stable.safeTransferFrom(CALLER, msg.sender, deltaY);
    }

    function borrowCallback(uint deltaL, uint deltaX, uint deltaY) public override {
    }

    /// @notice Returns the internal balances of risky and riskless tokens for an owner
    function getMargin(address owner) public override view returns (Margin.Data memory mar) {
        mar = _margins[owner];
    }

    // UNI V3 METHODS
    function swapExact0For1(
        address pool,
        uint256 amount0In,
        address recipient,
        uint160 sqrtPriceLimitX96
    ) external {
        IUniswapV3Pool(pool).swap(recipient, true, amount0In.toInt256(), sqrtPriceLimitX96, abi.encode(msg.sender));
    }

    function swap0ForExact1(
        address pool,
        uint256 amount1Out,
        address recipient,
        uint160 sqrtPriceLimitX96
    ) external {
        IUniswapV3Pool(pool).swap(recipient, true, -amount1Out.toInt256(), sqrtPriceLimitX96, abi.encode(msg.sender));
    }

    function swapExact1For0(
        address pool,
        uint256 amount1In,
        address recipient,
        uint160 sqrtPriceLimitX96
    ) external {
        IUniswapV3Pool(pool).swap(recipient, false, amount1In.toInt256(), sqrtPriceLimitX96, abi.encode(msg.sender));
    }

    function swap1ForExact0(
        address pool,
        uint256 amount0Out,
        address recipient,
        uint160 sqrtPriceLimitX96
    ) external {
        IUniswapV3Pool(pool).swap(recipient, false, -amount0Out.toInt256(), sqrtPriceLimitX96, abi.encode(msg.sender));
    }

    function swapToLowerSqrtPrice(
        address pool,
        uint160 sqrtPriceX96,
        address recipient
    ) external {
        IUniswapV3Pool(pool).swap(recipient, true, type(int256).max, sqrtPriceX96, abi.encode(msg.sender));
    }

    function swapToHigherSqrtPrice(
        address pool,
        uint160 sqrtPriceX96,
        address recipient
    ) external {
        IUniswapV3Pool(pool).swap(recipient, false, type(int256).max, sqrtPriceX96, abi.encode(msg.sender));
    }

    event SwapCallback(int256 amount0Delta, int256 amount1Delta);

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        address sender = abi.decode(data, (address));

        emit SwapCallback(amount0Delta, amount1Delta);

        if (amount0Delta > 0) {
            IERC20Minimal(IUniswapV3Pool(msg.sender).token0()).transferFrom(sender, msg.sender, uint256(amount0Delta));
        } else if (amount1Delta > 0) {
            IERC20Minimal(IUniswapV3Pool(msg.sender).token1()).transferFrom(sender, msg.sender, uint256(amount1Delta));
        } else {
            // if both are not gt 0, both must be 0.
            assert(amount0Delta == 0 && amount1Delta == 0);
        }
    }

    function mint(
        address pool,
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external {
        IUniswapV3Pool(pool).mint(recipient, tickLower, tickUpper, amount, abi.encode(msg.sender));
    }

    event MintCallback(uint256 amount0Owed, uint256 amount1Owed);

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external {
        address sender = abi.decode(data, (address));

        emit MintCallback(amount0Owed, amount1Owed);
        if (amount0Owed > 0)
            IERC20Minimal(IUniswapV3Pool(msg.sender).token0()).transferFrom(sender, msg.sender, amount0Owed);
        if (amount1Owed > 0)
            IERC20Minimal(IUniswapV3Pool(msg.sender).token1()).transferFrom(sender, msg.sender, amount1Owed);
    }


}
