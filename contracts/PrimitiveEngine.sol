// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @title   Primitive Engine
 * @author  Primitive
 * @dev     Create pools with parameters `Calibration` to replicate Black-scholes covered call payoffs.
 */

import "./libraries/ABDKMath64x64.sol";
import "./libraries/BlackScholes.sol";
import "./libraries/CumulativeNormalDistribution.sol";
import "./libraries/Calibration.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Position.sol";
import "./libraries/Margin.sol";
import "./libraries/Reserve.sol";
import "./libraries/Units.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./libraries/SwapMath.sol";

import "hardhat/console.sol";

interface ICallback {
    function addXYCallback(uint deltaX, uint deltaY) external;
    function removeXYCallback(uint deltaX, uint deltaY) external;
    function depositCallback(uint deltaX, uint deltaY) external;
    function withdrawCallback(uint deltaX, uint deltaY) external returns (address);
    function addXCallback(uint deltaX, uint deltaY) external;
    function borrowCallback() external returns (address);
    function removeXCallback(uint deltaX, uint deltaY) external;
    function repayCallback(bytes32 pid, uint deltaL) external;
    function getCaller() external returns (address);
}

contract PrimitiveEngine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
    using CumulativeNormalDistribution for int128;
    using ReplicationMath for int128;
    using Units for *;
    using Calibration for mapping(bytes32 => Calibration.Data);
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Margin for mapping(bytes32 => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;
    using SafeERC20 for IERC20;

    uint public constant INIT_SUPPLY = 10 ** 18;
    uint public constant FEE = 10 ** 3;
    uint public constant _NO_NONCE = type(uint).max;
    bytes32 public constant _NO_POOL = bytes32(0);

    event Deposited(address indexed from, uint deltaX, uint deltaY);
    event Withdrawn(address indexed from, uint deltaX, uint deltaY);
    event PositionUpdated(address indexed from, Position.Data pos);
    event MarginUpdated(address indexed from, Margin.Data mar);
    event Create(address indexed from, bytes32 indexed pid, Calibration.Data calibration);
    event Update(uint R1, uint R2, uint blockNumber);
    event AddedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event RemovedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event Swap(address indexed from, bytes32 indexed pid, bool indexed addXRemoveY, uint deltaIn, uint deltaOut);

    struct Accumulator {
        uint ARX1;
        uint ARX2;
        uint blockNumberLast;
    }

    address public immutable TX1; // always risky asset
    address public immutable TY2; // always risk free asset, TODO: rename vars?

    uint24 public fee;

    uint public _NONCE = _NO_NONCE;
    bytes32 public _POOL_ID = _NO_POOL;

    bytes32[] public allPools;
    Accumulator public accumulator;
    Margin.Data public activeMargin;
    Position.Data public activePosition;
    mapping(bytes32 => Calibration.Data) public settings;
    mapping(bytes32 => Reserve.Data) public reserves;
    mapping(bytes32 => Margin.Data) public margins;
    mapping(bytes32 => Position.Data) public positions;

    modifier lockPosition() {
        require(_NONCE != _NO_NONCE && _POOL_ID != _NO_POOL, "Position locked");
        _;
    }

    modifier lockMargin(Margin.Data memory next) {
        require(next.unlocked, "Margin locked");
        _;
    }

    constructor(address router_, address factory_, uint24 fee_, address risky, address riskFree) {
        router = ISwapRouter(router_);
        uniFactory = IUniswapV3Factory(factory_); 
        fee = fee_;
        TX1 = risky;
        TY2 = riskFree;
        require(uniFactory.getPool(risky, riskFree, 3000) != address(0), "NO POOL");
    }

    function getBX1() public view returns (uint) {
        return IERC20(TX1).balanceOf(address(this));
    }

    function getBY2() public view returns (uint) {
        return IERC20(TY2).balanceOf(address(this));
    }

    // create new curve with assets TX1 TY2
    // Setting initial reserves such that 1 LP == 1 SHORT option
    function create(Calibration.Data memory self, uint assetPrice) public {
        require(self.time > 0, "Time is 0");
        require(self.sigma > 0, "Sigma is 0");
        require(self.strike > 0, "Strike is 0");
        // Fetch the pool id and set its calibration data
        bytes32 pid = getPoolId(self);
        settings[pid] = Calibration.Data({
            strike: self.strike,
            sigma: self.sigma,
            time: self.time
        });
        // Call Delta = CDF(d1)
        int128 delta = BlackScholes.calculateCallDelta(assetPrice, self.strike, self.sigma, self.time);
        // Set x = 1 - delta
        uint RX1 = uint(1).fromUInt().sub(delta).parseUnits();
        // Set y = F(x)
        uint RY2 = SwapMath.calcRY2WithRX1(RX1, INIT_SUPPLY, self.strike, self.sigma, self.time).parseUnits();
        reserves[pid] = Reserve.Data({
            RX1: RX1,
            RY2: RY2,
            liquidity: INIT_SUPPLY,
            float: 0, // the LP shares available to be borrowed on a given pid
            debt: 0
        });
        allPools.push(pid);
        emit Update(RX1, RY2, block.number);
        emit Create(msg.sender, pid, self);
    }

    /**
     * @notice  Updates R to new values for X and Y.
     */
    function _update(bytes32 pid, uint postR1, uint postR2) public {
        Reserve.Data storage res = reserves[pid];
        res.RX1 = postR1;
        res.RY2 = postR2;
        // add new reserves to cumulative reserves
        Accumulator storage acc = accumulator;
        acc.ARX1 += postR1;
        acc.ARX2 += postR2;
        acc.blockNumberLast = block.number;
        emit Update(postR1, postR2, block.number);
    }

    /**
     * @notice  Commits transiently set `activePosition` to state of positions[encodePacked(owner,nonce)].
     */
    function _updatePosition(address owner, Position.Data memory next) internal lockPosition {
        Position.Data storage pos = _getPosition(owner, _NONCE, _POOL_ID);
        pos.edit(next.BX1, next.BY2, next.liquidity, next.float, next.debt);
    }

    /**
     * @notice  Commits transiently set `activeMargin` to state of margins[encodePacked(owner,nonce)].
     */
    function _updateMargin(address owner, Margin.Data memory next) internal lockMargin(next) {
        Margin.Data storage mar = _fetchMargin(owner);
        mar.edit(next.BX1, next.BY2);
    }

    // ===== Margin =====

    /**
     * @notice  Adds X and Y to internal balance of `owner` at position Id of `nonce`.
     */
    function deposit(address owner, uint deltaX, uint deltaY) public returns (bool) {
        Margin.Data memory margin_ = getMargin(owner);
        margin_.unlocked = true;

        // Update state
        if(deltaX > 0) margin_.BX1 += deltaX;
        if(deltaY > 0) margin_.BY2 += deltaY;
        _updateMargin(owner, margin_);


        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        ICallback(msg.sender).depositCallback(deltaX, deltaY);
        if(deltaX > 0) require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
        if(deltaY > 0) require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }

        // Commit state updates
        emit Deposited(owner, deltaX, deltaY);
        emit MarginUpdated(msg.sender, margin_);
        return true;
    }

    /**
     * @notice  Removes X and Y from internal balance of `owner` at position Id of `nonce`.
     */
    function withdraw(uint deltaX, uint deltaY) public returns (bool) {
        Margin.Data memory margin_ = getMargin(msg.sender);
        margin_.unlocked = true;

        // Update state
        if(deltaX > 0) margin_.BX1 -= deltaX;
        if(deltaY > 0) margin_.BY2 -= deltaY;
        _updateMargin(msg.sender, margin_);

        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        if(deltaX > 0) {
            IERC20(TX1).safeTransfer(msg.sender, deltaX);
            require(preBX1 - deltaX >= getBX1(), "Not enough TX1");
        }
        if(deltaY > 0) {
            IERC20(TY2).safeTransfer(msg.sender, deltaY);
            require(preBY2 - deltaY >= getBY2(), "Not enough TY2");
        }
        }

        // Commit state updates
        emit Withdrawn(msg.sender, deltaX, deltaY);
        emit MarginUpdated(msg.sender, margin_);
        return true;
    }

    // ===== Liquidity =====

    /**
     * @notice  Adds X to RX1 and Y to RY2. Adds `deltaL` to liquidity, owned by `owner`.
     */
    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL) public returns (uint postR1, uint postR2) {
        Margin.Data memory margin_ = getMargin(owner);
        margin_.unlocked = true;

        Position.Data memory pos_ = getPosition(owner, nonce, pid); // TODO: can potentially delete nonce
        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        Reserve.Data storage res = reserves[pid];
        uint liquidity = res.liquidity; // gas savings
        require(liquidity > 0, "Not bound");

        uint deltaX;
        uint deltaY;
        { // scope for RX1 and RY2, avoids stack too deep errors
        uint RX1 = res.RX1;
        uint RY2 = res.RY2;
        deltaX = deltaL * RX1 / liquidity;
        deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        postR1 = RX1 + deltaX;
        postR2 = RY2 + deltaY;
        int128 postInvariant = calcInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant.parseUnits() >= uint(0), "Invalid invariant");
        }
        
        // Update State
        res.liquidity += deltaL;
        pos_.liquidity += deltaL;

        // if internal balance can pay, use it
        if(margin_.BX1 >= deltaX && margin_.BY2 >= deltaY) {
            margin_.BX1 -= deltaX;
            margin_.BY2 -= deltaY;
            _updateMargin(owner, margin_);
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            ICallback(msg.sender).addXYCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }
        
        // Commit state updates
        _update(pid, postR1, postR2);
        _updatePosition(owner, pos_);
        emit AddedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    /**
     * @notice  Removes X from RX1 and Y from RY2. Removes `deltaL` from liquidity, owned by `owner`.
     */
    function removeBoth(bytes32 pid, uint nonce, uint deltaL, bool isInternal) public returns (uint postR1, uint postR2) {
        Margin.Data memory margin_ = getMargin(msg.sender);
        margin_.unlocked = true;
        Position.Data memory pos_ = getPosition(msg.sender, nonce, pid);
        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        Reserve.Data storage res = reserves[pid];
        uint liquidity = res.liquidity; // gas savings
        require(liquidity > 0, "Not bound");

        uint deltaX;
        uint deltaY;

        { // scope for calculting invariants
        bytes32 pid_ = pid;
        uint RX1 = res.RX1;
        uint RY2 = res.RY2;
        deltaX = deltaL * RX1 / liquidity;
        deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        postR1 = RX1 - deltaX;
        postR2 = RY2 - deltaY;
        int128 postInvariant = calcInvariant(pid_, postR1, postR2, liquidity);
        require(uint(0) >= postInvariant.parseUnits(), "Invalid invariant");
        }

        // Update state
        require(res.liquidity >= deltaL, "Above max burn");
        res.liquidity -= deltaL;
        pos_.liquidity -= deltaL;
    
        if(isInternal) {
            margin_.BX1 += deltaX;
            margin_.BY2 += deltaY;
            _updateMargin(msg.sender, margin_);
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IERC20(TX1).safeTransfer(margin_.owner, deltaX);
            IERC20(TY2).safeTransfer(margin_.owner, deltaY);
            ICallback(msg.sender).removeXYCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 - deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 - deltaY, "Not enough TY2");
        }
        
        // Commit state updates
        _update(pid, postR1, postR2);
        _updatePosition(msg.sender, pos_);
        emit RemovedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    // ===== Lending =====

    // @dev Increase `msg.sender` float factor by `deltaL`, marking `deltaL` LP shares
    // as available for `borrow`.  Position must satisfy pos_.liquidity >= pos_.float.
    // As a side effect, `lend` will modify global reserve `float` by the same amount.
    function lend(address owner, bytes32 pid, uint nonce, uint deltaL) public returns (uint) {
        Position.Data memory pos_ = getPosition(owner, nonce, pid);
        Reserve.Data storage res = reserves[pid];

        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        if (deltaL > 0) {
            // increment position float factor by `deltaL`
            pos_.float += deltaL;
            _updatePosition(msg.sender, pos_);
        } 

        res.float += deltaL;
        return deltaL;
    }

    // @dev Decrease global float factor by `deltaL`, and increase `owner` 
    // debt factor by `deltaL`.  Global debt and float must satisfy
    // liquidity >= debt + float.
    function borrow(bytes32 pid, address recipient, uint nonce, uint deltaL, uint maxPremium) public returns (uint) {
        Position.Data memory pos_ = getPosition(recipient, nonce, pid);
        Reserve.Data storage res = reserves[pid];

        Margin.Data memory margin_ = getMargin(recipient);

        require(res.float > deltaL, "INSUFFICIENT FLOAT");

        pos_.unlocked = true;
        margin_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        uint liquidity = res.liquidity;

        uint deltaX = deltaL * res.RX1 / liquidity;
        uint deltaY = deltaL * res.RY2 / liquidity;

        {
        // swap risk free asset for risky asset
        uint256 amountOutRisky = router.exactInputSingle(ISwapRouter.ExactInputSingleParams({
          tokenIn: TY2,
          tokenOut: TX1,
          fee: fee,
          recipient: address(this),
          deadline: 1,
          amountIn: deltaY,
          amountOutMinimum: uint256(0),
          sqrtPriceLimitX96: uint160(0)
        }));

        uint riskyNeeded = deltaL - (deltaX + amountOutRisky);
        
        require(margin_.BX1 > riskyNeeded, "INSUFFICIENT RISKY BALANCE");

        margin_.BX1 -= riskyNeeded;

        pos_.debt += deltaL; // increase position debt by deltaL
        _updatePosition(msg.sender, pos_); // lock in updates to position
        uint postFloat = res.float - deltaL; // reduce float factor by deltaL
        uint postLiquidity = liquidity - deltaL; // reduce float factor by deltaL
        uint postDebt = res.debt + deltaL; // increase debt factor by deltaL
        }

        uint postRX1 = res.RX1 - deltaX;
        uint postRY2 = res.RY2 - deltaY;

        _update(pid, postRX1, postRY2);

        return deltaL;
    }

    /**
     * @notice Decreases a position's `loan` debt by decreasing its liquidity. Increases float.
     */
    function repay(bytes32 pid, address owner, uint nonce, uint deltaL) public returns (uint) {
        // Get the position
        Position.Data memory pos_ = getPosition(owner, nonce, pid);
        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        // Take away loan debt and liquidity.
        if(deltaL > 0) {
            require(pos_.debt >= 0, "No loan to repay");
            ICallback(msg.sender).repayCallback(pid, deltaL); // add liquidity, keeping excess.
            pos_.liquidity -= deltaL;
            pos_.debt -= deltaL;
            _updatePosition(owner, pos_);
        }

        Reserve.Data storage res = reserves[pid];
        res.float += deltaL;
        
        return deltaL;
    }

    // ===== Swaps =====

    /**
     * @notice  Swap between risky and riskfree assets
     * @dev     If `addXRemoveY` is true, we request Y out, and must add X to the pool's reserves.
                Else, we request X out, and must add Y to the pool's reserves.
     */
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) public returns (uint deltaIn) {
        // Fetch internal balances of owner address
        Margin.Data memory margin_ = getMargin(msg.sender);
        margin_.unlocked = true;

        // Fetch the global reserves for the `pid` curve
        Reserve.Data storage res = reserves[pid];
        int128 invariant = getInvariantLast(pid); //gas savings
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings

        uint postRX1;
        uint postRY2;
        {
            if(addXRemoveY) {
                int128 nextRX1 = calcRX1WithYOut(pid, deltaOut); // remove Y from reserves, and use calculate the new X reserve value.
                postRX1 = nextRX1.sub(invariant).parseUnits();
                postRY2 = RY2 - deltaOut;
                deltaIn =  postRX1 > RX1 ? postRX1 - RX1 : RX1 - postRX1; // the diff between new X and current X is the deltaIn
            } else {
                int128 nextRY2 = calcRY2WithXOut(pid, deltaOut); // subtract X from reserves, and use to calculate the new Y reserve value.
                postRX1 = RX1 - deltaOut;
                postRY2 = invariant.add(nextRY2).parseUnits();
                deltaIn =  postRY2 > RY2 ? postRY2 - RY2 : RY2 - postRY2; // the diff between new Y and current Y is the deltaIn
            }
        }

        require(deltaInMax >= deltaIn, "Too expensive");
        int128 postInvariant = calcInvariant(pid, postRX1, postRY2, res.liquidity);
        require(postInvariant.parseUnits() >= invariant.parseUnits(), "Invalid invariant");

        {// avoids stack too deep errors
        bool xToY = addXRemoveY;
        address to = msg.sender;
        uint margin = xToY ? margin_.BX1 : margin_.BY2;
        if(margin >= deltaIn) {
            if(xToY) {
                margin_.BX1 -= deltaIn;
            } else {
                margin_.BY2 -= deltaIn;
            }
            { // avoids stack too deep errors, sending the asset out that we are removing
            uint deltaOut_ = deltaOut;
            address token = xToY ? TY2 : TX1;
            uint preBalance = xToY ? getBY2() : getBX1();
            IERC20(token).safeTransfer(to, deltaOut_);
            uint postBalance = xToY ? getBY2() : getBX1();
            require(postBalance >= preBalance - deltaOut_, "Sent too much tokens");
            }
            _updateMargin(to, margin_);
        } else {
            {
            uint deltaOut_ = deltaOut;
            uint deltaIn_ = deltaIn;
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            address token = xToY ? TY2 : TX1;
            IERC20(token).safeTransfer(to, deltaOut_);
            ICallback(msg.sender).addXCallback(deltaIn_, deltaOut_);
            uint postBX1 = getBX1();
            uint postBY2 = getBY2();
            uint deltaX_ = xToY ? deltaIn_ : deltaOut_;
            uint deltaY_ = xToY ? deltaOut_ : deltaIn_;
            require(postBX1 >= (xToY ? preBX1 + deltaX_ : preBX1 - deltaX_), "Not enough TX1");
            require(postBY2 >= (xToY ? preBY2 - deltaY_ : preBY2 + deltaY_), "Not enough TY2");
            }
        }
        }
        
        bytes32 pid_ = pid;
        uint deltaOut_ = deltaOut;
        _update(pid_, postRX1, postRY2);
        emit Swap(msg.sender, pid, addXRemoveY, deltaIn, deltaOut_);
    }

    // ===== Swap and Liquidity Math =====

    /**
     * @notice  Fetches a new R2 from a decreased R1.
     */
    function calcRY2WithXOut(bytes32 pid, uint deltaXOut) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 - deltaXOut; // new reserve1 value.
        return SwapMath.calcRY2WithRX1(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    /**
     * @notice  Fetches a new R1 from a decreased R2.
     */
    function calcRX1WithYOut(bytes32 pid, uint deltaYOut) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RY2 = res.RY2 - deltaYOut;
        return SwapMath.calcRX1WithRY2(RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    // ===== Position & Margin State Fetchers =====

    function _fetchPosition(address owner, uint nonce, bytes32 pid) internal returns (Position.Data storage) {
        Position.Data storage pos = positions.fetch(owner, nonce, pid);
        if(pos.owner == address(0)) {
            pos.owner = owner;
            pos.nonce = nonce;
            pos.pid = pid;
        }
        return pos;
    }

    function _fetchMargin(address owner) internal returns (Margin.Data storage) {
        Margin.Data storage mar = margins.fetch(owner);
        if(mar.owner == address(0)) {
            mar.owner = owner;
        }
        return mar;
    }

    // ===== View ===== 

    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        int128 invariant = ReplicationMath.calcInvariant(postR1, postR2, postLiquidity, cal.strike, cal.sigma, cal.time);
        return invariant;
    }

    function getInvariantLast(bytes32 pid) public view returns (int128) {
        Reserve.Data memory res = reserves[pid];
        int128 invariant = calcInvariant(pid, res.RX1, res.RY2, res.liquidity);
        return invariant;
    }

    function getReserve(bytes32 pid) public view returns (Reserve.Data memory) {
        Reserve.Data memory res = reserves[pid];
        return res; 
    }

    function getAccumulator(bytes32 pid) public view returns (Accumulator memory) {
        Accumulator memory acc = accumulator;
        return acc; 
    }

    function getCalibration(bytes32 pid) public view returns (Calibration.Data memory) {
        Calibration.Data memory cal = settings[pid];
        return cal; 
    }

    function getPosition(address owner, uint nonce, bytes32 pid) public view returns (Position.Data memory) {
        Position.Data memory pos = positions[Position.getPositionId(owner, nonce, pid)];
        return pos; 
    }

    function getMargin(address owner) public view returns (Margin.Data memory) {
        Margin.Data memory mar = margins[Margin.getMarginId(owner)];
        return mar;
    }

    function getPoolId(Calibration.Data memory self) public view returns(bytes32 pid) {
        pid = keccak256(
            abi.encodePacked(
                self.time,
                self.sigma,
                self.strike
            )
        );
    }
}
