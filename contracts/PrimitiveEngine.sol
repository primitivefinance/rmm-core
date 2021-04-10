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
    using Calibration for mapping(bytes32 => Calibration.Data);
    using Position for mapping(bytes32 => Position.Data);
    using Reserve for mapping(bytes32 => Reserve.Data);
    using SafeERC20 for IERC20;

    uint public constant INIT_SUPPLY = 10 ** 18;
    uint public constant FEE = 10 ** 3;

    event Deposited(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event Withdrawn(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event PositionUpdated(address indexed from, Position.Data pos);
    event MarginUpdated(address indexed from, Margin.Data mar);
    event Create(address indexed from, bytes32 indexed pid, Calibration.Data calibration);
    event Update(uint R1, uint R2, uint blockNumber);
    event AddedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event RemovedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event AddedX(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event RemovedX(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);

    struct Accumulator {
        uint ARX1;
        uint ARX2;
        uint blockNumberLast;
    }

    address public immutable TX1;
    address public immutable TY2;

    bytes32[] public allPools;
    Accumulator public accumulator;
    Margin.Data public activeMargin;
    Position.Data public activePosition;
    mapping(bytes32 => Calibration.Data) public settings;
    mapping(bytes32 => Reserve.Data) public reserves;
    mapping(bytes32 => Margin.Data) public margins;
    mapping(bytes32 => Position.Data) public positions;

    modifier lock() {
        require(activePosition.unlocked || activeMargin.unlocked, "Position and Margin locked");
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
    function _updatePosition(address owner, uint nonce) internal lock {
        Position.Data storage pos = _getPosition(owner, nonce);
        Position.Data memory nextPos = activePosition;
        require(pos.owner == nextPos.owner, "Not owner");
        require(pos.nonce == nextPos.nonce, "Not nonce");
        pos.BX1 = nextPos.BX1;
        pos.BY2 = nextPos.BY2;
        pos.liquidity = nextPos.liquidity;
        pos.unlocked = false;
        delete activePosition;
    }

    /**
     * @notice  Commits transiently set `activeMargin` to state of margins[encodePacked(owner,nonce)].
     */
    function _updateMargin(address owner, uint nonce) internal lock {
        Margin.Data storage mar = _getMargin(owner, nonce);
        Margin.Data memory next = activeMargin;
        require(mar.owner == next.owner, "Not owner");
        require(mar.nonce == next.nonce, "Not nonce");
        mar.BX1 = next.BX1;
        mar.BY2 = next.BY2;
        mar.unlocked = false;
        delete activeMargin;
    }

    /**
     * @notice  Adds X and Y to internal balance of `owner` at position Id of `nonce`.
     */
    function deposit(address owner, uint nonce, uint deltaX, uint deltaY) public returns (bool) {
        activeMargin = _getMargin(owner, nonce); // deleted in _updatePosition() call
        activeMargin.unlocked = true;

        // Update state
        if(deltaX > 0) activeMargin.BX1 += deltaX;
        if(deltaY > 0) activeMargin.BY2 += deltaY;

        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        ICallback(msg.sender).depositCallback(deltaX, deltaY);
        if(deltaX > 0) require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
        if(deltaY > 0) require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }

        // Commit state updates
        emit Deposited(owner, nonce, deltaX, deltaY);
        emit MarginUpdated(msg.sender, activeMargin);
        _updateMargin(owner, nonce);
        return true;
    }

    /**
     * @notice  Removes X and Y from internal balance of `owner` at position Id of `nonce`.
     */
    function withdraw(address owner, uint nonce, uint deltaX, uint deltaY) public returns (bool) {
        activeMargin = _getMargin(owner, nonce); // deleted in _updatePosition() call
        activeMargin.unlocked = true;

        // Update state
        if(deltaX > 0) activeMargin.BX1 -= deltaX;
        if(deltaY > 0) activeMargin.BY2 -= deltaY;

        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        address caller = ICallback(msg.sender).withdrawCallback(deltaX, deltaY);
        if(deltaX > 0) {
            IERC20(TX1).safeTransfer(caller, deltaX);
            require(preBX1 - deltaX >= getBX1(), "Not enough TX1");
        }
        if(deltaY > 0) {
            IERC20(TY2).safeTransfer(caller, deltaY);
            require(preBY2 - deltaY >= getBY2(), "Not enough TY2");
        }
        }

        // Commit state updates
        emit Withdrawn(owner, nonce, deltaX, deltaY);
        emit MarginUpdated(msg.sender, activeMargin);
        _updateMargin(owner, nonce);
        return true;
    }

    // ===== Liquidity =====

    /**
     * @notice  Adds X to RX1 and Y to RY2. Adds `deltaL` to liquidity, owned by `owner`.
     */
    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL) public returns (uint, uint) {
        activeMargin = _getMargin(owner, nonce);
        activePosition = _getPosition(owner, nonce);
        Reserve.Data storage res = reserves[pid];

        uint liquidity = res.liquidity; // gas savings
        require(liquidity > 0, "Not bound");
        uint RX1 = res.RX1;
        uint RY2 = res.RY2;
        uint deltaX = deltaL * RX1 / liquidity;
        uint deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        uint postR1 = RX1 + deltaX;
        uint postR2 = RY2 + deltaY;
        int128 postInvariant = calcInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant.parseUnits() >= uint(0), "Invalid invariant");
        
        // Update State
        res.liquidity += deltaL;
        activeMargin.unlocked = true;
        activePosition.unlocked = true;
        activePosition.liquidity += deltaL;

        // if internal balance can pay, use it
        if(activeMargin.BX1 >= deltaX && activeMargin.BY2 >= deltaY) {
            activeMargin.BX1 -= deltaX;
            activeMargin.BY2 -= deltaY;
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            ICallback(msg.sender).addXYCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }
        
        // Commit state updates
        _update(pid, postR1, postR2);
        _updatePosition(owner, nonce);
        _updateMargin(owner, nonce);
        emit AddedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    /**
     * @notice  Removes X from RX1 and Y from RY2. Removes `deltaL` from liquidity, owned by `owner`.
     */
    function removeBoth(bytes32 pid, uint nonce, uint deltaL, bool isInternal) public returns (uint postR1, uint postR2) {
        activeMargin = _getMargin(msg.sender, nonce);
        activePosition = _getPosition(msg.sender, nonce);

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
        activeMargin.unlocked = true;
        activePosition.unlocked = true;
        activePosition.liquidity -= deltaL;
        if(isInternal) {
            activeMargin.BX1 += deltaX;
            activeMargin.BY2 += deltaY;
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IERC20(TX1).safeTransfer(activeMargin.owner, deltaX);
            IERC20(TY2).safeTransfer(activeMargin.owner, deltaY);
            ICallback(msg.sender).removeXYCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 - deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 - deltaY, "Not enough TY2");
        }
        
        // Commit state updates
        _update(pid, postR1, postR2);
        _updatePosition(msg.sender, nonce);
        _updateMargin(msg.sender, nonce);
        emit RemovedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    function lend(bytes32 pid, uint nonce, uint deltaL) public returns (uint) {
        activePosition = _getPosition(msg.sender, nonce);
        activePosition.loaned = true;
        Reserve.Data storage res = reserves[pid];
        res.liquidity -= deltaL;
        res.float += deltaL;
        _updatePosition(msg.sender, nonce);
        return deltaL;
    }

    function borrow(bytes32 pid, address owner, uint nonce, uint deltaL, uint maxPremium) public returns (uint) {
        Reserve.Data storage res = reserves[pid];
        activePosition = _getPosition(owner, nonce);
        activePosition.borrowed = true;
        res.float -= deltaL;
        activePosition.liquidity += deltaL;
        uint preBX1 = getBX1();
        ICallback(msg.sender).borrowCallback(pid, deltaL, maxPremium); // remove liquidity, pull in premium token.
        uint postBX1 = getBX1();
        uint assetPrice = 0;
        uint value = 0; // get value
        uint difference = assetPrice > value ? assetPrice - value : value - assetPrice; // get difference between lp value and asset value.
        require(difference >= postBX1 - preBX1, "Not enough premium");
        _updatePosition(owner, nonce);
        return deltaL;
    }

    function repay(bytes32 pid, address owner, uint nonce, uint deltaL) public returns (uint) {
        Reserve.Data storage res = reserves[pid];
        activePosition = _getPosition(owner, nonce);
        ICallback(msg.sender).repayCallback(pid, deltaL); // add liquidity, keeping excess.
        activePosition.liquidity -= deltaL;
        res.float += deltaL;
        if(activePosition.liquidity == 0) {
            activePosition.borrowed = false;
        }
        _updatePosition(owner, nonce);
        return deltaL;
    }

    // ===== Swaps =====

    /**
     * @notice  Updates the reserves after adding X and removing Y.
     * @return  deltaY Amount of Y removed.
     */
    function addX(bytes32 pid, address owner, uint nonce, uint deltaX, uint minDeltaY) public returns (uint deltaY) {
        activeMargin = _getMargin(owner, nonce);
        activePosition = _getPosition(owner, nonce);

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
        activeMargin.unlocked = true;
        activePosition.unlocked = true;

        // if the internal position can pay for the swap, use it.
        if(activeMargin.BX1 >= deltaX) {
            uint preBY2 = getBY2();
            IERC20(TY2).safeTransfer(owner, deltaY);
            activeMargin.BX1 -= deltaX;
            require(getBY2() >= preBY2 - deltaY, "Sent too much TY2");
        } else { 
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IERC20(TY2).safeTransfer(owner, deltaY);
            ICallback(msg.sender).addXCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 - deltaY, "Not enough TY2");
        }
        

        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        _updatePosition(owner, nonce);
        _updateMargin(owner, nonce);
        emit AddedX(msg.sender, nonce, deltaX, deltaY);
        return deltaY;
    }

    /**
     * @notice  Updates the reserves after removing X and adding Y.
     * @return  deltaY Amount of Y added.
     */
    function removeX(bytes32 pid, address owner, uint nonce, uint deltaX, uint maxDeltaY) public returns (uint deltaY) {
        activeMargin = _getMargin(owner, nonce);
        activePosition = _getPosition(owner, nonce);

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
        activeMargin.unlocked = true;
        activePosition.unlocked = true;

        if(activeMargin.BY2 >= deltaY) {
            uint preBX1 = getBX1();
            IERC20(TX1).safeTransfer(owner, deltaX);
            activeMargin.BY2 -= deltaY;
            require(getBX1() >= preBX1 - deltaX, "Sent too much TX1");
        } else 
        // Check balances and trigger callback
        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        IERC20(TX1).safeTransfer(owner, deltaX);
        ICallback(msg.sender).removeXCallback(deltaX, deltaY);
        require(getBX1() >= preBX1 - deltaX, "Not enough TX1");
        require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }
        
        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        _updatePosition(owner, nonce);
        _updateMargin(owner, nonce);
        emit RemovedX(msg.sender, nonce, deltaX, deltaY);
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

    function _getPosition(address owner, uint nonce) internal returns (Position.Data storage) {
        Position.Data storage pos = positions.fetch(owner, nonce);
        if(pos.owner == address(0)) {
            pos.owner = owner;
            pos.nonce = nonce;
        }
        return pos;
    }

    function _getMargin(address owner, uint nonce) internal returns (Margin.Data storage) {
        Margin.Data storage mar = margins.fetch(owner, nonce);
        if(mar.owner == address(0)) {
            mar.owner = owner;
            mar.nonce = nonce;
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

    function getPosition(address owner, uint nonce) public view returns (Position.Data memory) {
        Position.Data memory pos = positions[Position.getPositionId(owner, nonce)];
        return pos; 
    }

    function getMargin(address owner, uint nonce) public view returns (Margin.Data memory) {
        Margin.Data memory mar = margins[Margin.getMarginId(owner, nonce)];
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