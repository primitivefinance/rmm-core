pragma solidity 0.7.6;

/**
 * @title   Primitive Engine
 * @author  Primitive
 */

import "./ReplicationMath.sol";
import "./ABDKMath64x64.sol";

contract PrimitiveEngine {

    uint public constant INIT_SUPPLY = 10 ** 21;

    event Update(uint R1, uint R2, uint blockNumber);
    event AddedBoth(address indexed from, uint deltaX, uint deltaY, uint liquidity);
    event RemovedBoth(address indexed from, uint deltaX, uint deltaY, uint liquidity);
    event AddedX(address indexed from, uint deltaX, uint deltaY);
    event RemovedX(address indexed from, uint deltaX, uint deltaY);

    uint public r1;
    uint public r2;
    uint public strike;
    uint public sigma;
    uint public time;
    uint public liquidity;

    constructor() {}

    function initialize(uint strike_, uint sigma_, uint time_) public {
        require(time == 0, "Already initialized");
        require(time_ > 0, "Time is 0");
        require(strike_ > 0, "Strike is 0");
        require(sigma_ > 0, "Sigma is 0");
        strike = strike_;
        sigma = sigma_;
        time = time_; 
    }

    /**
     * @notice  Updates R to new values for X and Y.
     */
    function _update(uint deltaX, uint deltaY) public {
        r1 = deltaX;
        r2 = deltaY;
        emit Update(deltaX, deltaY, block.number);
    }

    function addBoth(uint deltaX, uint deltaY) public returns (uint, uint, uint) {
        if(r1 == 0 && r2 == 0) {
            _update(deltaX, deltaY);
            liquidity = INIT_SUPPLY;
            return (deltaX, deltaY, INIT_SUPPLY);
        }
        uint postR1 = r1 + deltaX;
        uint postR2 = r2 + deltaY;
        int128 invariant = getInvariant(postR1, postR2);
        require(invariant >= invariantLast(), "Invalid invariant");
        uint liquidity_ = liquidity; // gas savings
        uint minted = liquidity_ * (deltaX * r1 - 1) - liquidity_;
        liquidity += minted;
        _update(postR1, postR2);
        emit AddedBoth(msg.sender, deltaX, deltaY, minted);
        return (postR1, postR2, minted);
    }

    function removeBoth(uint deltaL) public returns (uint, uint) {
        uint liquidity_ = liquidity; // gas savings
        uint deltaX = ( 1 - ( ( liquidity_ - deltaL ) / liquidity_ ) ) * r1;
        uint deltaY = ( 1 - ( ( liquidity_ - deltaL ) / liquidity_ ) ) * r2;
        uint postR1 = r1 - deltaX;
        uint postR2 = r2 - deltaY;
        int128 postInvariant = getInvariant(postR1, postR2);
        require(postInvariant >= invariantLast(), "Invalid invariant");
        _update(postR1, postR2);
        liquidity -= deltaL;
        emit RemovedBoth(msg.sender, deltaX, deltaY, deltaL);
        return (postR1, postR2);
    }

    /**
     * @notice  Updates the reserves after adding X and removing Y.
     * @return  Amount of Y removed.
     */
    function addX(uint deltaX, uint minDeltaY) public returns (uint) {
        // amount of Y that must be removed.
        uint actualY = getOutputAmount(deltaX);
        require(actualY >= minDeltaY, "Not enough Y removed");
        uint postR1 = r1 + deltaX;
        uint postR2 = r2 - actualY;
        int128 invariant = getInvariant(postR1, postR2);
        require(invariant >= invariantLast(), "Invalid invariant");
        _update(postR1, postR2);
        emit AddedX(msg.sender, deltaX, actualY);
        return actualY;
    }

    /**
     * @notice  Updates the reserves after removing X and adding Y.
     * @return  Amount of Y added.
     */
    function removeX(uint deltaX, uint maxDeltaY) public returns (uint) {
        uint actualY = getInputAmount(deltaX);
        require(maxDeltaY >= actualY, "Too much Y added");
        uint postR1 = r1 - deltaX;
        uint postR2 = r2 + actualY;
        int128 invariant = getInvariant(postR1, postR2);
        require(invariant >= invariantLast(), "Invalid invariant");
        _update(postR1, postR2);
        emit RemovedX(msg.sender, deltaX, actualY);
        return actualY;
    }

    // ===== Swap and Liquidity Math =====

    function getInvariant(uint postR1, uint postR2) public view returns (int128) {
        int128 invariant = ReplicationMath.getConstant(postR1, postR2, strike, sigma, time);
        return invariant;
    }

    /**
     * @notice  Fetches the amount of y which must leave the R2 to preserve the invariant.
     * @dev     R1 = x, R2 = y
     */
    function getOutputAmount(uint deltaX) public view returns (uint) {
        uint scaled = _getOutputR2Scaled(deltaX);
        uint r2_ = r2; // gas savings
        uint deltaY = scaled > r2_ ? scaled - r2_ : r2_ - scaled;
        return deltaY;
    }

    /**
     * @notice  Fetches the amount of y which must enter the R2 to preserve the invariant.
     */
    function getInputAmount(uint deltaX) public view returns (uint) {
        uint scaled = _getInputR2Scaled(deltaX);
        uint r2_ = r2; // gas savings
        uint deltaY = scaled > r2_ ? scaled - r2_ : r2_ - scaled;
        return deltaY;

    }

    /**
     * @notice  Fetches a new R2 from an increased R1.
     */
    function _getOutputR2(uint deltaX) public view returns (int128) {
        uint r1_ = r1 + deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(r1_, strike, sigma, time);
    }

    /**
     * @notice  Fetches a new R2 from a decreased R1.
     */
    function _getInputR2(uint deltaX) public view returns (int128) {
        uint r1_ = r1 + deltaX; // new reserve1 value.
        return ReplicationMath.getTradingFunction(r1_, strike, sigma, time);
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
        return ReplicationMath.getProportionalVolatility(sigma, time);
    }

    function tradingFunction() public view returns (int128) {
        return ReplicationMath.getTradingFunction(r1, strike, sigma, time);
    }

    // ===== View ===== 

    function invariantLast() public view returns (int128) {
        return ReplicationMath.getConstant(r1, r2, strike, sigma, time);
    }
}