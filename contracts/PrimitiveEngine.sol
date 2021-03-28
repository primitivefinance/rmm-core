pragma solidity 0.7.6;
pragma abicoder v2;

/**
 * @title   Primitive Engine
 * @author  Primitive
 */

import "./ReplicationMath.sol";
import "./ABDKMath64x64.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "hardhat/console.sol";

interface ICallback {
    function addXYCallback(uint deltaX, uint deltaY) external;
    function directDepositCallback(uint deltaX, uint deltaY) external;
    function withdrawalCallback(uint deltaX, uint deltaY) external returns (address);
    function getCaller() external returns (address);
}

contract PrimitiveEngine {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for int128;
    using ReplicationMath for int128;

    uint public constant INIT_SUPPLY = 10 ** 21;
    uint public constant FEE = 10 ** 3;

    event PositionUpdated(address indexed from, Position pos);
    event Update(uint R1, uint R2, uint blockNumber);
    event AddedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event RemovedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event AddedX(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);
    event RemovedX(address indexed from, uint indexed nonce, uint deltaX, uint deltaY);

    struct Calibration {
        uint256 strike;
        uint32 sigma;
        uint32 time;
    }

    struct Capital {
        uint RX1;
        uint RX2;
        uint liquidity;
    }

    struct Accumulator {
        uint ARX1;
        uint ARX2;
        uint blockNumberLast;
    }

    struct Position {
        address owner;
        uint nonce;
        uint BX1;
        uint BY2;
        uint liquidity;
        bool unlocked;
    }

    enum UpdatePosition {ADD_LIQUIDITY, REMOVE_LIQUIDITY, ADD_BX1, ADD_BX2}

    address public immutable TX1;
    address public immutable TY2;

    Accumulator public accumulator;
    Calibration public calibration;
    Capital public capital;
    Position public activePosition;
    mapping(bytes32 => Position) public positions;

    constructor(address risky, address riskFree) {
        TX1 = risky;
        TY2 = riskFree;
    }

    function getBX1() public view returns (uint) {
        return IERC20(TX1).balanceOf(address(this));
    }

    function getBY2() public view returns (uint) {
        return IERC20(TY2).balanceOf(address(this));
    }

    function initialize(uint strike_, uint32 sigma_, uint32 time_) public {
        require(calibration.time == 0, "Already initialized");
        require(time_ > 0, "Time is 0");
        require(strike_ > 0, "Strike is 0");
        require(sigma_ > 0, "Sigma is 0");
        calibration = Calibration({
            strike: strike_,
            sigma: sigma_,
            time: time_
        });
        capital = Capital({
            RX1: 0,
            RX2: 0,
            liquidity: INIT_SUPPLY
        });
    }

    /**
     * @notice  Updates R to new values for X and Y.
     */
    function _update(uint postR1, uint postR2) public {
        Capital storage cap = capital;
        cap.RX1 = postR1;
        cap.RX2 = postR2;

        Accumulator storage acc = accumulator;
        acc.ARX1 += postR1;
        acc.ARX2 += postR2;
        acc.blockNumberLast = block.number;
        emit Update(postR1, postR2, block.number);
    }

    function start(uint deltaX, uint deltaY) public returns (bool) {
        // if first time liquidity is added, mint the initial supply
        Capital memory cap = capital;
        require(cap.RX1 == 0 && cap.RX2 == 0, "Already initialized");
        _update(deltaX, deltaY);
        return true;
    }

    modifier lock() {
        require(activePosition.unlocked, "Position locked");
        _;
    }

    function _updatePosition(address owner, uint nonce) internal lock {
        Position storage pos = _getPosition(owner, nonce);
        Position memory nextPos = activePosition;
        require(pos.owner == nextPos.owner, "Not owner");
        require(pos.nonce == nextPos.nonce, "Not nonce");
        pos.BX1 = nextPos.BX1;
        pos.BY2 = nextPos.BY2;
        pos.liquidity = nextPos.liquidity;
        delete activePosition;
    }

    function directDeposit(address owner, uint nonce, uint deltaX, uint deltaY) public returns (bool) {
        activePosition = _getPosition(owner, nonce);

        // Update state
        activePosition.unlocked = true;
        activePosition.BX1 += deltaX;
        activePosition.BY2 += deltaY;

        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        ICallback(msg.sender).directDepositCallback(deltaX, deltaY);
        require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
        require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }

        // Commit state updates
        emit PositionUpdated(msg.sender, activePosition);
        _updatePosition(owner, nonce);
        activePosition.unlocked = false;
        return true;
    }

    function directWithdrawal(address owner, uint nonce, uint deltaX, uint deltaY) public returns (bool) {
        activePosition = _getPosition(owner, nonce);

        // Update state
        activePosition.unlocked = true;
        require(activePosition.BX1 >= deltaX, "Not enough X");
        require(activePosition.BY2 >= deltaY, "Not enough Y");
        activePosition.BX1 -= deltaX;
        activePosition.BY2 -= deltaY;

        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        address caller = ICallback(msg.sender).withdrawalCallback(deltaX, deltaY);
        IERC20(TX1).safeTransfer(caller, deltaX);
        IERC20(TY2).safeTransfer(caller, deltaY);
        require(preBX1 - deltaX >= getBX1(), "Not enough TX1");
        require(preBY2 - deltaY >= getBY2(), "Not enough TY2");
        }

        // Commit state updates
        emit PositionUpdated(msg.sender, activePosition);
        _updatePosition(owner, nonce);
        activePosition.unlocked = false;
        return true;
    }

    function addBoth(address owner, uint nonce, uint deltaL) public returns (uint, uint) {
        activePosition = _getPosition(owner, nonce);

        Capital storage cap = capital;
        uint liquidity = cap.liquidity; // gas savings
        require(liquidity > 0, "Not bound");
        uint RX1 = cap.RX1;
        uint RX2 = cap.RX2;
        uint deltaX = deltaL * RX1 / liquidity;
        uint deltaY = deltaL * RX2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        uint postR1 = RX1 + deltaX;
        uint postR2 = RX2 + deltaY;
        int128 postInvariant = getInvariant(postR1, postR2);
        require(postInvariant >= invariantLast(), "Invalid invariant");
        
        // Update State
        cap.liquidity += deltaL;
        activePosition.unlocked = true;
        activePosition.liquidity += deltaL;

        // Check balances and trigger callback
        { // avoids stack too deep errors
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        ICallback(msg.sender).addXYCallback(deltaX, deltaY);
        require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
        require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }
        
        // Commit state updates
        _update(postR1, postR2);
        _updatePosition(owner, nonce);
        emit AddedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    function removeBoth(uint nonce, uint deltaL) public returns (uint, uint) {
        activePosition = _getPosition(msg.sender, nonce);

        Capital storage cap = capital;
        uint liquidity = cap.liquidity; // gas savings

        require(liquidity > 0, "Not bound");
        uint RX1 = cap.RX1;
        uint RX2 = cap.RX2;
        uint deltaX = deltaL * RX1 / liquidity;
        uint deltaY = deltaL * RX2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        uint postR1 = RX1 - deltaX;
        uint postR2 = RX2 - deltaY;
        int128 postInvariant = getInvariant(postR1, postR2);
        require(invariantLast() >= postInvariant, "Invalid invariant");

        // Update state
        require(cap.liquidity >= deltaL, "Above max burn");
        cap.liquidity -= deltaL;
        activePosition.unlocked = true;
        require(activePosition.liquidity >= deltaL, "Not enough L");
        activePosition.liquidity -= deltaL;
        activePosition.BX1 += deltaX;
        activePosition.BY2 += deltaY;
        
        // Commit state updates
        _update(postR1, postR2);
        _updatePosition(msg.sender, nonce);
        emit RemovedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    /**
     * @notice  Updates the reserves after adding X and removing Y.
     * @return  Amount of Y removed.
     */
    function addX(address owner, uint nonce, uint deltaX, uint minDeltaY) public returns (uint) {
        activePosition = _getPosition(owner, nonce);

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        // R2a - R2b = -deltaY
        Capital storage cap = capital;
        uint256 RX1 = cap.RX1; // gas savings
        uint256 RX2 = cap.RX2; // gas savings
        int128 invariant = invariantLast(); //gas savings
        int128 FXR1 = _getOutputR2(deltaX); // r1 + deltaX
        uint256 FXR2 = invariant.add(FXR1).fromIntToWei();
        uint256 deltaY =  FXR2 > RX2 ? FXR2 - RX2 : RX2 - FXR2;
        deltaY -= deltaY / FEE;

        require(deltaY >= minDeltaY, "Not enough Y removed");
        uint256 postR1 = RX1 + deltaX;
        uint256 postR2 = RX2 - deltaY;
        int128 postInvariant = getInvariant(postR1, postR2);
        require(postInvariant >= invariant, "Invalid invariant");

        // Update State
        activePosition.unlocked = true;
        require(activePosition.BX1 >= deltaX, "Not enough X");
        activePosition.BX1 -= deltaX;
        activePosition.BY2 += deltaY;

        _update(postR1, postR2);
        _updatePosition(owner, nonce);
        emit AddedX(msg.sender, nonce, deltaX, deltaY);
        return deltaY;
    }

    /**
     * @notice  Updates the reserves after removing X and adding Y.
     * @return  Amount of Y added.
     */
    function removeX(address owner, uint nonce, uint deltaX, uint maxDeltaY) public returns (uint) {
        activePosition = _getPosition(owner, nonce);

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        Capital storage cap = capital;
        uint256 RX1 = cap.RX1; // gas savings
        uint256 RX2 = cap.RX2; // gas savings
        int128 invariant = invariantLast(); //gas savings
        int128 FXR1 = _getInputR2(deltaX); // r1 - deltaX
        uint256 FXR2 = invariant.add(FXR1).fromIntToWei();
        uint256 deltaY =  FXR2 > RX2 ? FXR2 - RX2 : RX2 - FXR2;
        deltaY += deltaY / FEE;

        require(maxDeltaY >= deltaY, "Too much Y added");
        uint postR1 = RX1 - deltaX;
        uint postR2 = RX2 + deltaY;
        int128 postInvariant = getInvariant(postR1, postR2);
        require(postInvariant >= invariant, "Invalid invariant");

        // Update State
        activePosition.unlocked = true;
        activePosition.BX1 += deltaX;
        require(activePosition.BY2 >= deltaY, "Not enough Y");
        activePosition.BY2 -= deltaY;
        
        _update(postR1, postR2);
        _updatePosition(owner, nonce);
        emit RemovedX(msg.sender, nonce, deltaX, deltaY);
        return deltaY;
    }

    // ===== Swap and Liquidity Math =====

    function getInvariant(uint postR1, uint postR2) public view returns (int128) {
        Calibration memory cal = calibration;
        int128 invariant = ReplicationMath.getConstant(postR1, postR2, cal.strike, cal.sigma, cal.time);
        return invariant;
    }

    /**
     * @notice  Fetches the amount of y which must leave the R2 to preserve the invariant.
     * @dev     R1 = x, R2 = y
     */
    function getOutputAmount(uint deltaX) public view returns (uint) {
        uint scaled = _getOutputR2Scaled(deltaX);
        uint RX2 = capital.RX2; // gas savings
        uint deltaY = scaled > RX2 ? scaled - RX2 : RX2 - scaled;
        return deltaY;
    }

    /**
     * @notice  Fetches the amount of y which must enter the R2 to preserve the invariant.
     */
    function getInputAmount(uint deltaX) public view returns (uint) {
        uint scaled = _getInputR2Scaled(deltaX);
        uint RX2 = capital.RX2; // gas savings
        uint deltaY = scaled > RX2 ? scaled - RX2 : RX2 - scaled;
        return deltaY;

    }

    /**
     * @notice  Fetches a new R2 from an increased R1. F(R1).
     */
    function _getOutputR2(uint deltaX) public view returns (int128) {
        Calibration memory cal = calibration;
        uint RX1 = capital.RX1 + deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(RX1, cal.strike, cal.sigma, cal.time);
    }

    /**
     * @notice  Fetches a new R2 from a decreased R1.
     */
    function _getInputR2(uint deltaX) public view returns (int128) {
        Calibration memory cal = calibration;
        uint RX1 = capital.RX1 - deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(RX1, cal.strike, cal.sigma, cal.time);
    }

    function _getOutputR2Scaled(uint deltaX) public view returns (uint) {
        uint scaled = ReplicationMath.fromInt(_getOutputR2(deltaX)) * 1e18 / ReplicationMath.MANTISSA;
        return scaled;
    }

    function _getInputR2Scaled(uint deltaX) public view returns (uint) {
        uint scaled = ReplicationMath.fromInt(_getInputR2(deltaX)) * 1e18 / ReplicationMath.MANTISSA;
        return scaled;
    }


    // ==== Math Library Entry Points ====
    function getCDF(uint x) public view returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return ReplicationMath.getCDF(z);
    }

    function proportionalVol() public view returns (int128) {
        Calibration memory cal = calibration;
        return ReplicationMath.getProportionalVolatility(cal.sigma, cal.time);
    }

    function tradingFunction() public view returns (int128) {
        Calibration memory cal = calibration;
        return ReplicationMath.getTradingFunction(capital.RX1, cal.strike, cal.sigma, cal.time);
    }

    // ===== View ===== 

    function _getPosition(address owner, uint nonce) internal returns (Position storage) {
        bytes32 pid = keccak256(abi.encodePacked(owner, nonce));
        Position storage pos = positions[pid];
        if(pos.owner == address(0)) {
            pos.owner = owner;
            pos.nonce = nonce;
        }
        return pos;
    }

    function getPosition(address owner, uint nonce) public view returns (Position memory) {
        bytes32 pid = keccak256(abi.encodePacked(owner, nonce));
        Position memory pos = positions[pid]; 
        return pos;
    }

    function invariantLast() public view returns (int128) {
        Calibration memory cal = calibration;
        return ReplicationMath.getConstant(capital.RX1, capital.RX2, cal.strike, cal.sigma, cal.time);
    }

    function getCapital() public view returns (Capital memory) {
        Capital memory cap = capital;
        return cap; 
    }

    function getAccumulator() public view returns (Accumulator memory) {
        Accumulator memory acc = accumulator;
        return acc; 
    }

    function getCalibration() public view returns (Calibration memory) {
        Calibration memory cal = calibration;
        return cal; 
    }
}