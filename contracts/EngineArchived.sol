// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @title   Primitive Engine
 * @author  Primitive
 */

import "./libraries/ABDKMath64x64.sol";
import "./libraries/BlackScholes.sol";
import "./libraries/CumulativeNormalDistribution.sol";
import "./libraries/Calibration.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Position.sol";
import "./libraries/Reserve.sol";
import "./libraries/Units.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

interface ICallback {
    function addXYCallback(uint deltaX, uint deltaY) external;
    function directDepositCallback(uint deltaX, uint deltaY) external;
    function withdrawalCallback(uint deltaX, uint deltaY) external returns (address);
    function getCaller() external returns (address);
}

contract PrimitiveEngine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
    using CumulativeNormalDistribution for int128;
    using ReplicationMath for int128;
    using Units for *;
    using Calibration for mapping(bytes32 => Calibration.Data);
    using Position for mapping(bytes32 => Position.Data);
    using Reserve for mapping(bytes32 => Reserve.Data);
    using SafeERC20 for IERC20;

    uint public constant INIT_SUPPLY = 10 ** 18;
    uint public constant FEE = 10 ** 3;

    event PositionUpdated(address indexed from, Position.Data pos);
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
    Position.Data public activePosition;
    Calibration.Data public calibration; // temp, fix
    mapping(bytes32 => Calibration.Data) public settings;
    mapping(bytes32 => Reserve.Data) public reserves;
    mapping(bytes32 => Position.Data) public positions;

    modifier lock() {
        require(activePosition.unlocked, "Position.Data locked");
        _;
    }

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
        uint RY2 = ReplicationMath.getTradingFunction(RX1, INIT_SUPPLY, self.strike, self.sigma, self.time).parseUnits();
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
        return true;
    }

    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL) public returns (uint, uint) {
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
        int128 postInvariant = getInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant >= invariantLast(pid), "Invalid invariant");
        
        // Update State
        res.liquidity += deltaL;
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
        _update(pid, postR1, postR2);
        _updatePosition(owner, nonce);
        emit AddedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    function removeBoth(bytes32 pid, uint nonce, uint deltaL) public returns (uint, uint) {
        activePosition = _getPosition(msg.sender, nonce);

        Reserve.Data storage res = reserves[pid];
        uint liquidity = res.liquidity; // gas savings

        require(liquidity > 0, "Not bound");
        uint RX1 = res.RX1;
        uint RY2 = res.RY2;
        uint deltaX = deltaL * RX1 / liquidity;
        uint deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Delta is 0");
        uint postR1 = RX1 - deltaX;
        uint postR2 = RY2 - deltaY;
        int128 postInvariant = getInvariant(pid, postR1, postR2, liquidity);
        require(invariantLast(pid) >= postInvariant, "Invalid invariant");

        // Update state
        require(res.liquidity >= deltaL, "Above max burn");
        res.liquidity -= deltaL;
        activePosition.unlocked = true;
        require(activePosition.liquidity >= deltaL, "Not enough L");
        activePosition.liquidity -= deltaL;
        activePosition.BX1 += deltaX;
        activePosition.BY2 += deltaY;
        
        // Commit state updates
        _update(pid, postR1, postR2);
        _updatePosition(msg.sender, nonce);
        emit RemovedBoth(msg.sender, nonce, deltaX, deltaY);
        return (postR1, postR2);
    }

    /**
     * @notice  Updates the reserves after adding X and removing Y.
     * @return  deltaY Amount of Y removed.
     */
    function addX(bytes32 pid, address owner, uint nonce, uint deltaX, uint minDeltaY) public returns (uint deltaY) {
        activePosition = _getPosition(owner, nonce);

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        // R2a - R2b = -deltaY
        Reserve.Data storage res = reserves[pid];
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings
        uint256 liquidity = res.liquidity; // gas savings
        int128 invariant = invariantLast(pid); //gas savings
        { // scope for calculating deltaY, avoids stack too deep errors
        int128 FXR1 = _getOutputR2(pid, deltaX); // F(r1 + deltaX)
        uint256 FXR2 = invariant.add(FXR1).parseUnits();
        deltaY =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
        console.log(deltaY);
        //deltaY -= deltaY / FEE;
        }

        require(deltaY >= minDeltaY, "Not enough Y removed");
        uint256 postR1 = RX1 + deltaX;
        uint256 postR2 = RY2 - deltaY;
        int128 postInvariant = getInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant >= invariant, "Invalid invariant");

        // Update State
        activePosition.unlocked = true;
        require(activePosition.BX1 >= deltaX, "Not enough X");
        activePosition.BX1 -= deltaX;
        activePosition.BY2 += deltaY;

        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        _updatePosition(owner, nonce);
        emit AddedX(msg.sender, nonce, deltaX, deltaY);
        return deltaY;
    }

    /**
     * @notice  Updates the reserves after removing X and adding Y.
     * @return  deltaY Amount of Y added.
     */
    function removeX(bytes32 pid, address owner, uint nonce, uint deltaX, uint maxDeltaY) public returns (uint deltaY) {
        activePosition = _getPosition(owner, nonce);

        // I = FXR2 - FX(R1)
        // I + FX(R1) = FXR2
        Reserve.Data storage res = reserves[pid];
        uint256 RX1 = res.RX1; // gas savings
        uint256 RY2 = res.RY2; // gas savings
        uint256 liquidity = res.liquidity; // gas savings
        int128 invariant = invariantLast(pid); //gas savings
        { // scope for calculating deltaY, avoids stack too deep errors
        int128 FXR1 = _getInputR2(pid, deltaX); // r1 - deltaX
        uint256 FXR2 = invariant.add(FXR1).parseUnits();
        deltaY =  FXR2 > RY2 ? FXR2 - RY2 : RY2 - FXR2;
        deltaY += deltaY / FEE;
        }

        require(maxDeltaY >= deltaY, "Too much Y added");
        uint postR1 = RX1 - deltaX;
        uint postR2 = RY2 + deltaY;
        int128 postInvariant = getInvariant(pid, postR1, postR2, liquidity);
        require(postInvariant >= invariant, "Invalid invariant");

        // Update State
        activePosition.unlocked = true;
        activePosition.BX1 += deltaX;
        require(activePosition.BY2 >= deltaY, "Not enough Y");
        activePosition.BY2 -= deltaY;
        
        bytes32 pid_ = pid;
        _update(pid_, postR1, postR2);
        _updatePosition(owner, nonce);
        emit RemovedX(msg.sender, nonce, deltaX, deltaY);
        return deltaY;
    }

    // ===== Swap and Liquidity Math =====

    function getInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        int128 invariant = ReplicationMath.calcInvariant(postR1, postR2, postLiquidity, cal.strike, cal.sigma, cal.time);
        return invariant;
    }

    /**
     * @notice  Fetches the amount of y which must leave the R2 to preserve the invariant.
     * @dev     R1 = x, R2 = y
     */
    function getOutputAmount(bytes32 pid, uint deltaX) public view returns (uint) {
        uint scaled = _getOutputR2Scaled(pid, deltaX);
        Reserve.Data memory res = reserves[pid];
        uint RY2 = res.RY2; // gas savings
        uint deltaY = scaled > RY2 ? scaled - RY2 : RY2 - scaled;
        return deltaY;
    }

    /**
     * @notice  Fetches the amount of y which must enter the R2 to preserve the invariant.
     */
    function getInputAmount(bytes32 pid, uint deltaX) public view returns (uint) {
        uint scaled = _getInputR2Scaled(pid, deltaX);
        Reserve.Data memory res = reserves[pid];
        uint RY2 = res.RY2; // gas savings
        uint deltaY = scaled > RY2 ? scaled - RY2 : RY2 - scaled;
        return deltaY;

    }

    /**
     * @notice  Fetches a new R2 from an increased R1. F(R1).
     */
    function _getOutputR2(bytes32 pid, uint deltaX) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 + deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    /**
     * @notice  Fetches a new R2 from a decreased R1.
     */
    function _getInputR2(bytes32 pid, uint deltaX) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 - deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    function _getOutputR2Scaled(bytes32 pid, uint deltaX) public view returns (uint) {
        uint scaled = Units.fromInt(_getOutputR2(pid, deltaX)) * 1e18 / Units.MANTISSA;
        return scaled;
    }

    function _getInputR2Scaled(bytes32 pid, uint deltaX) public view returns (uint) {
        uint scaled = Units.fromInt(_getInputR2(pid, deltaX)) * 1e18 / Units.MANTISSA;
        return scaled;
    }


    // ==== Math Library Entry Points ====
    function getCDF(uint x) public view returns (int128) {
        int128 z = ABDKMath64x64.fromUInt(x);
        return z.getCDF();
    }

    function proportionalVol(bytes32 pid) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        return ReplicationMath.getProportionalVolatility(cal.sigma, cal.time);
    }

    function tradingFunction(bytes32 pid) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        return ReplicationMath.getTradingFunction(res.RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    // ===== View ===== 

    function _getPosition(address owner, uint nonce) internal returns (Position.Data storage) {
        bytes32 pid = keccak256(abi.encodePacked(owner, nonce));
        Position.Data storage pos = positions[pid];
        if(pos.owner == address(0)) {
            pos.owner = owner;
            pos.nonce = nonce;
        }
        return pos;
    }

    

    function invariantLast(bytes32 pid) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        return ReplicationMath.calcInvariant(res.RX1, res.RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
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

    function getPoolId(Calibration.Data memory self) public view returns(bytes32 pid) {
        pid = keccak256(
            abi.encodePacked(
                self.time,
                self.sigma,
                self.strike
            )
        );
    }

    // ===== Test =====

    function getInverseCDFTest() public view returns (int128 y) {
        int128 p = 0x4000000000000830; // 0.25
        y = p.getInverseCDF();
    }

    function getCallDelta(Calibration.Data memory self, uint assetPrice) public view returns (int128 y) {
        y = BlackScholes.calculateCallDelta(assetPrice, self.strike, self.sigma, self.time);
    }
}