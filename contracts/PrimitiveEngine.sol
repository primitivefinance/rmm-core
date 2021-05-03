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

import "./engines/Tier2Engine.sol";

import "hardhat/console.sol";

interface ICallback {
    function addXYCallback(uint deltaX, uint deltaY) external;
    function removeXYCallback(uint deltaX, uint deltaY) external;
    function depositCallback(uint deltaX, uint deltaY) external;
    function withdrawCallback(uint deltaX, uint deltaY) external returns (address);
    function addXCallback(uint deltaX, uint deltaY) external;
    function removeXCallback(uint deltaX, uint deltaY) external;
    function borrowCallback(bytes32 pid, uint deltaL, uint maxPremium) external;
    function repayCallback(bytes32 pid, uint deltaL) external;
    function getCaller() external returns (address);
}

contract PrimitiveEngine is Tier2Engine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
    using CumulativeNormalDistribution for int128;
    using ReplicationMath for int128;
    using Units for *;
    using Margin for mapping(bytes32 => Margin.Data);
    using Margin for Margin.Data;
    using Calibration for mapping(bytes32 => Calibration.Data);
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;
    using Reserve for mapping(bytes32 => Reserve.Data);
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
    event AddedX(address indexed from, uint deltaX, uint deltaY);
    event RemovedX(address indexed from, uint deltaX, uint deltaY);

    struct Accumulator {
        uint ARX1;
        uint ARX2;
        uint blockNumberLast;
    }

    address public immutable TX1;
    address public immutable TY2;

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

    constructor(address risky, address riskFree) {
        TX1 = risky;
        TY2 = riskFree;
    }

    function test() public override {

    }

    function getBX1() public view returns (uint) {
        return IERC20(TX1).balanceOf(address(this));
    }

    function getBY2() public view returns (uint) {
        return IERC20(TY2).balanceOf(address(this));
    }

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
        uint RY2 = _calcRY2(RX1, INIT_SUPPLY, self.strike, self.sigma, self.time).parseUnits();
        reserves[pid] = Reserve.Data({
            RX1: RX1,
            RY2: RY2,
            liquidity: INIT_SUPPLY,
            float: 0
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
        pos.edit(next.BX1, next.BY2, next.liquidity, next.float, next.loan);
    }

    /**
     * @notice  Commits transiently set `activeMargin` to state of margins[encodePacked(owner,nonce)].
     */
    function _updateMargin(address owner, Margin.Data memory next) internal lockMargin(next) {
        Margin.Data storage mar = _getMargin(owner);
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

        Position.Data memory pos_ = getPosition(owner, nonce, pid);
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

    /**
     * @notice  Increases a position's float and decreses its liquidity.
     */
    function lend(bytes32 pid, uint nonce, uint deltaL) public returns (uint) {
        // Get the position
        Position.Data memory pos_ = getPosition(msg.sender, nonce, pid);
        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        if (deltaL > 0) {
            pos_.float += deltaL;
            pos_.liquidity -= deltaL;
            _updatePosition(msg.sender, pos_);
        } 

        // Update state
        Reserve.Data storage res = reserves[pid];
        res.liquidity -= deltaL;
        res.float += deltaL;
        return deltaL;
    }

    /**
     * @notice  Increases a positions `loan` debt by increasing its liquidity.
     */
    function borrow(bytes32 pid, address owner, uint nonce, uint deltaL, uint maxPremium) public returns (uint) {
        // Get the position and update it
        Position.Data memory pos_ = getPosition(owner, nonce, pid);
        pos_.unlocked = true;
        _NONCE = nonce;
        _POOL_ID = pid;

        // Update position
        if(deltaL > 0) {
            require(pos_.float == 0, "Lent shares outstanding");
            pos_.liquidity += deltaL;
            pos_.loan += deltaL;
            _updatePosition(owner, pos_);
        }
        
        // Update Reserve
        Reserve.Data storage res = reserves[pid];
        res.float -= deltaL;
        res.liquidity += deltaL;

        // Trigger the callback
        uint preBX1 = getBX1();
        ICallback(msg.sender).borrowCallback(pid, deltaL, maxPremium); // remove liquidity, pull in premium token.
        uint postBX1 = getBX1();
        uint assetPrice = 0;
        uint value = 0; // get value
        uint difference = assetPrice > value ? assetPrice - value : value - assetPrice; // get difference between lp value and asset value.
        require(difference >= postBX1 - preBX1, "Not enough premium");


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
            require(pos_.loan >= 0, "No loan to repay");
            ICallback(msg.sender).repayCallback(pid, deltaL); // add liquidity, keeping excess.
            pos_.liquidity -= deltaL;
            pos_.loan -= deltaL;
            _updatePosition(owner, pos_);
        }

        Reserve.Data storage res = reserves[pid];
        res.float += deltaL;
        
        return deltaL;
    }

    // ===== Swaps =====

    function swap(bytes32 pid, bool riskyToRiskFree, uint deltaOut, uint deltaInMax) public returns (uint deltaIn) {
        // Fetch internal balances of owner address
        Margin.Data memory margin_ = getMargin(msg.sender);
        margin_.unlocked = true;

        // Fetch the global reserves for the `pid` curve
        Reserve.Data storage res = reserves[pid];
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings
        uint256 liquidity = res.liquidity; // gas savings
        int128 invariant = getInvariantLast(pid); //gas savings

        {
            int128 FXR1;
            uint256 FXR2;
            if(riskyToRiskFree) {
                FXR1 = _getOutputRY2(pid, deltaX); // F(r1 + deltaX)
                FXR2 = invariant.add(FXR1).parseUnits();
                deltaIn =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
            } else {
                FXR1 = _getInputRY2(pid, deltaX); // r1 - deltaX
                FXR2 = invariant.add(FXR1).parseUnits();
                deltaIn =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
            }
        }

    }

    /**
     * @notice  Updates the reserves after adding X and removing Y.
     * @return  deltaY Amount of Y removed.
     */
    function addX(bytes32 pid, address owner, uint deltaX, uint minDeltaY) public returns (uint deltaY) {
        Margin.Data memory margin_ = getMargin(owner);
        margin_.unlocked = true;

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        // R2a - R2b = -deltaY
        Reserve.Data storage res = reserves[pid];
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings
        uint256 liquidity = res.liquidity; // gas savings
        int128 invariant = getInvariantLast(pid); //gas savings
        { // scope for calculating deltaY, avoids stack too deep errors
        int128 FXR1 = _getOutputRY2(pid, deltaX); // F(r1 + deltaX)
        uint256 FXR2 = invariant.add(FXR1).parseUnits();
        deltaY =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
        //deltaY -= deltaY / FEE;
        }

        require(deltaY >= minDeltaY, "Not enough Y removed");
        uint256 postR1 = RX1 + deltaX;
        uint256 postR2 = RY2 - deltaY;
        int128 postInvariant = calcInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant.parseUnits() >= uint(0), "Invalid invariant");

        // Update State
        // if the internal position can pay for the swap, use it.
        {// avoids stack too deep errors
        address to = owner;
        uint deltaX_ = deltaX;
        uint deltaY_ = deltaY;
        if(margin_.BX1 >= deltaX_) {
            margin_.BX1 -= deltaX_;
            uint preBY2 = getBY2();
            IERC20(TY2).safeTransfer(to, deltaY_);
            require(getBY2() >= preBY2 - deltaY_, "Sent too much TY2");
            _updateMargin(to, margin_);
        } else { 
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IERC20(TY2).safeTransfer(to, deltaY_);
            ICallback(msg.sender).addXCallback(deltaX_, deltaY_);
            require(getBX1() >= preBX1 + deltaX_, "Not enough TX1");
            require(getBY2() >= preBY2 - deltaY_, "Not enough TY2");
        }
        }
        

        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        emit AddedX(msg.sender, deltaX, deltaY);
        return deltaY;
    }

    /**
     * @notice  Updates the reserves after removing X and adding Y.
     * @return  deltaY Amount of Y added.
     */
    function removeX(bytes32 pid, address owner, uint deltaX, uint maxDeltaY) public returns (uint deltaY) {
        Margin.Data memory margin_ = getMargin(owner);
        margin_.unlocked = true;

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        Reserve.Data storage res = reserves[pid];
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings
        uint256 liquidity = res.liquidity; // gas savings
        int128 invariant = getInvariantLast(pid); //gas savings
        { // scope for calculating deltaY, avoids stack too deep errors
        int128 FXR1 = _getInputRY2(pid, deltaX); // r1 - deltaX
        uint256 FXR2 = invariant.add(FXR1).parseUnits();
        deltaY =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
        deltaY += deltaY / FEE;
        }

        require(maxDeltaY >= deltaY, "Too much Y added");
        uint postR1 = RX1 - deltaX;
        uint postR2 = RY2 + deltaY;
        int128 postInvariant = calcInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant.parseUnits() >= uint(0), "Invalid invariant");

        // Update State
        {
        uint deltaX_ = deltaX;
        uint deltaY_ = deltaY;
        address to = owner;
        if(margin_.BY2 >= deltaY_) {
            uint preBX1 = getBX1();
            IERC20(TX1).safeTransfer(to, deltaX_);
            margin_.BY2 -= deltaY_;
            require(getBX1() >= preBX1 - deltaX_, "Sent too much TX1");
            _updateMargin(to, margin_);
        } else 
        // Check balances and trigger callback
        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        IERC20(TX1).safeTransfer(to, deltaX_);
        ICallback(msg.sender).removeXCallback(deltaX_, deltaY_);
        require(getBX1() >= preBX1 - deltaX_, "Not enough TX1");
        require(getBY2() >= preBY2 + deltaY_, "Not enough TY2");
        }
        }
        
        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        emit RemovedX(msg.sender, deltaX, deltaY);
        return deltaY;
    }

    // ===== Swap and Liquidity Math =====

    /**
     * @notice  Fetches a new R2 from an increased R1. F(R1).
     */
    function _getOutputRY2(bytes32 pid, uint deltaX) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 + deltaX; // new reserve1 value.
        return _calcRY2(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    /**
     * @notice  Fetches a new R2 from a decreased R1.
     */
    function _getInputRY2(bytes32 pid, uint deltaX) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 - deltaX; // new reserve1 value.
        return _calcRY2(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    /**
     * @notice  Fetches a new R1 from an increased R2.
     */
    function _getOutputRX1(bytes32 pid, uint deltaY) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RY2 = res.RY2 + deltaY;
        
    }

    function _getPosition(address owner, uint nonce, bytes32 pid) internal returns (Position.Data storage) {
        Position.Data storage pos = positions.fetch(owner, nonce, pid);
        if(pos.owner == address(0)) {
            pos.owner = owner;
            pos.nonce = nonce;
            pos.pid = pid;
        }
        return pos;
    }

    function _getMargin(address owner) internal returns (Margin.Data storage) {
        Margin.Data storage mar = margins.fetch(owner);
        if(mar.owner == address(0)) {
            mar.owner = owner;
        }
        return mar;
    }

    // ===== View ===== 

    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        int128 invariant = _calcInvariant(postR1, postR2, postLiquidity, cal.strike, cal.sigma, cal.time);
        return invariant;
    }

    /**
     * @notice  Fetches the amount of y which must leave the R2 to preserve the invariant.
     * @dev     R1 = x, R2 = y
     */
    function getOutputAmount(bytes32 pid, uint deltaX) public view returns (uint) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        int128 deltaYInt = _calcOutput(deltaX, res.RX1, res.RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
        uint deltaY = deltaYInt.parseUnits();
        return deltaY;
    }

    /**
     * @notice  Fetches the amount of y which must enter the R2 to preserve the invariant.
     */
    function getInputAmount(bytes32 pid, uint deltaX) public view returns (uint) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        int128 deltaYInt = _calcInput(deltaX, res.RX1, res.RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
        uint deltaY = deltaYInt.parseUnits();
        return deltaY;

    }

    function getInvariantLast(bytes32 pid) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        int128 invariant = _calcInvariant(res.RX1, res.RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
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