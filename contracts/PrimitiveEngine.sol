// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @title   Primitive Engine
/// @author  Primitive
/// @dev     Create pools with parameters `Calibration` to replicate Black-scholes covered call payoffs.

import "./libraries/ABDKMath64x64.sol";
import "./libraries/BlackScholes.sol";
import "./libraries/Calibration.sol";
import "./libraries/Margin.sol";
import "./libraries/Position.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Reserve.sol";
import "./libraries/SwapMath.sol";
import "./libraries/Units.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/callback/IPrimitiveLendingCallbacks";
import "./interfaces/callback/IPrimitiveLiquidityCallbacks";
import "./interfaces/callback/IPrimitiveMarginCallbacks";
import "./interfaces/callback/IPrimitiveSwapCallback.sol";
import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveFactory.sol";

import "hardhat/console.sol";

contract PrimitiveEngine is IPrimitiveEngine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
    using ReplicationMath for int128;
    using Units for *;
    using Calibration for mapping(bytes32 => Calibration.Data);
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Reserve for Reserve.Data;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;
    using SafeERC20 for IERC20;

    uint public constant _NO_NONCE = type(uint).max;
    bytes32 public constant _NO_POOL = bytes32(0);

    address public immutable override factory;
    address public immutable override TX1; // always risky asset
    address public immutable override TY2; // always riskless asset, TODO: rename vars?

    uint public _NONCE = _NO_NONCE;
    bytes32 public _POOL_ID = _NO_POOL;

    modifier lock(bytes32 pid, uint nonce) {
        require(_POOL_ID == _NO_POOL, "Pid set");
        require(_NONCE == _NO_NONCE, "Nonce set");
        _NONCE = nonce;
        _POOL_ID = pid;
        _;
        _NONCE = _NO_NONCE;
        _POOL_ID = _NO_POOL;
    }

    bytes32[] public override allPools; // each `pid` is pushed to this array on `create()` calls

    mapping(bytes32 => Calibration.Data) public override settings;
    mapping(address => Margin.Data) public override margins;
    mapping(bytes32 => Position.Data) public override positions;
    mapping(bytes32 => Reserve.Data) public override reserves;


    /// @notice Deploys an Engine with two tokens, a 'Risky' and 'Riskless'
    constructor() {
        (factory, TX1, TY2) = IPrimitiveFactory(msg.sender).args(); 
    }

    /// @notice Returns the risky token balance of this contract
    function getBX1() public view returns (uint) {
        return IERC20(TX1).balanceOf(address(this));
    }

    /// @notice Returns the riskless token balance of this contract
    function getBY2() public view returns (uint) {
        return IERC20(TY2).balanceOf(address(this));
    }

    /// @notice Generates a new curve with parameters `self`
    /// @param  self The calibration of the curve incl. params time, sigma, and strike.
    /// @param  assetPrice The spot price of the risky token in riskless units.
    function create(Calibration.Data memory self, uint assetPrice) external override returns(bytes32 pid) {
        require(self.time > 0, "Time is 0");
        require(self.sigma > 0, "Sigma is 0");
        require(self.strike > 0, "Strike is 0");
        // fetch the keccak hash of the parameters
        pid = getPoolId(self);
        require(settings[pid].time == 0, "Already created");
        // set the pid for the calibration settings
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
        // initialize the reserves to have 1e18 shares of liquidity
        reserves[pid] = Reserve.Data({
            RX1: RX1, // risky token balance
            RY2: RY2, // riskless token balance
            liquidity: 1e18, // 1e18
            float: 0, // the LP shares available to be borrowed on a given pid
            debt: 0 // the LP shares borrowed from the float
        });
        // add the pid to all the pids initialized
        allPools.push(pid);

        // check that balances were sent to contract to initialize
        require(getBX1() >= RX1, "Not enough risky tokens");
        require(getBY2() >= RY2, "Not enough riskless tokens");
        emit Update(RX1, RY2, block.number);
        emit Create(msg.sender, pid, self);
}

    // ===== Margin =====

    /// @notice  Adds X and Y to internal balance of `owner` at position Id of `nonce`.
    function deposit(address owner, uint deltaX, uint deltaY) external override returns (bool) {
        uint preBX1 = getBX1();
        uint preBY2 = getBY2();
        IPrimitiveMarginCallbacks(msg.sender).depositCallback(deltaX, deltaY);
        if(deltaX > 0) require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
        if(deltaY > 0) require(getBY2() >= preBY2 + deltaY, "Not enough TY2");

        Margin.Data storage mar = margins.fetch(owner);
        mar.deposit(deltaX, deltaY);
        emit Deposited(msg.sender, owner, deltaX, deltaY);
        return true;
    }

    
    /// @notice  Removes X and Y from internal balance of `msg.sender`.
    function withdraw(uint deltaX, uint deltaY) public override returns (bool) {
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
        // Update Margin state
        Margin.Data storage mar = margins.fetch(msg.sender);
        margins.withdraw(deltaX, deltaY);

        margins.withdraw(deltaX, deltaY);
        emit Withdrawn(msg.sender, msg.sender, deltaX, deltaY);
        return true;
    }

    // ===== Liquidity =====

    /// @notice  Adds X to RX1 and Y to RY2. Adds `deltaL` to liquidity, owned by `owner`.
    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL, bool isInternal) public lock(pid, nonce) override returns (uint deltaX, uint deltaY) {
        Reserve.Data storage res = reserves[pid];
        uint liquidity = res.liquidity; // gas savings
        require(liquidity > 0, "Not initialized");

        uint postRX1;
        uint postRY2;
        { // scope for RX1 and RY2, avoids stack too deep errors
        (uint RX1, uint RY2) = (res.RX1, res.RY2);
        deltaX = deltaL * RX1 / liquidity;
        deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Deltas are 0");
        postRX1 = RX1 + deltaX;
        postRY2 = RY2 + deltaY;
        bytes32 pid_ = pid;
        int128 preInvariant = getInvariantLast(pid_);
        int128 postInvariant = calcInvariant(pid_, postRX1, postRY2, liquidity);
        require(postInvariant.parseUnits() >= preInvariant.parseUnits(), "Invalid invariant");
        }

        if(isInternal) {
            margins.withdraw(deltaX, deltaY);
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IPrimitiveLiquidityCallbacks(msg.sender).addBothFromExternalCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 + deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 + deltaY, "Not enough TY2");
        }

        bytes32 pid_ = pid;
        Position.Data storage pos = positions.fetch(owner, nonce, pid_);
        pos.addLiquidity(deltaL); // Update position liquidity

        // Commit state updates
        res.mint(deltaX, deltaY, deltaL);

        emit Update(postRX1, postRY2, block.number);
        emit AddedBoth(msg.sender, nonce, deltaX, deltaY);
        return (deltaX, deltaY);
    }

    
    /// @notice  Removes X from RX1 and Y from RY2. Removes `deltaL` from liquidity, owned by `msg.sender`.
    function removeBoth(bytes32 pid, uint nonce, uint deltaL, bool isInternal) public lock(pid, nonce) override returns (uint deltaX, uint deltaY) {
        Reserve.Data storage res = reserves[pid];
        uint liquidity = res.liquidity; // gas savings
        require(liquidity > 0, "Not initialized");

        uint postRX1;
        uint postRY2;

        { // scope for calculting invariants
        int128 invariant = getInvariantLast(pid);
        bytes32 pid_ = pid;
        uint RX1 = res.RX1;
        uint RY2 = res.RY2;
        deltaX = deltaL * RX1 / liquidity;
        deltaY = deltaL * RY2 / liquidity;
        require(deltaX > 0 && deltaY > 0, "Deltas are 0");
        postRX1 = RX1 - deltaX;
        postRY2 = RY2 - deltaY;
        int128 postInvariant = calcInvariant(pid_, postRX1, postRY2, liquidity);
        require(invariant.parseUnits() >= postInvariant.parseUnits(), "Invalid invariant");
        }

        // Update state
        require(res.liquidity >= deltaL, "Above max burn");
        if(isInternal) {
            Margin.Data storage mar = margins.fetch(msg.sender);
            mar.deposit(deltaX, deltaY);
        } else {
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            IERC20(TX1).safeTransfer(msg.sender, deltaX);
            IERC20(TY2).safeTransfer(msg.sender, deltaY);
            IPrimitiveLiquidityCallbacks(msg.sender).removeXYCallback(deltaX, deltaY);
            require(getBX1() >= preBX1 - deltaX, "Not enough TX1");
            require(getBY2() >= preBY2 - deltaY, "Not enough TY2");
        }
        
        positions.removeLiquidity(nonce, pid, deltaL); // Update position liqudiity
        res.burn(deltaX, deltaY, deltaL);
        
        emit Update(postRX1, postRY2, block.number);
        emit RemovedBoth(msg.sender, nonce, deltaX, deltaY);
        return (deltaX, deltaY);
    }

    // ===== Lending =====

    event Loaned(address indexed from, bytes32 indexed pid, uint indexed nonce, uint deltaL);
    event Claimed(address indexed from, bytes32 indexed pid, uint indexed nonce, uint deltaL);
    event Borrowed(address indexed recipient, bytes32 indexed pid, uint indexed nonce, uint deltaL, uint maxPremium);
    event Repaid(address indexed owner, bytes32 indexed pid, uint indexed nonce, uint deltaL);

    /// @dev Increase `msg.sender` float factor by `deltaL`, marking `deltaL` LP shares
    /// as available for `borrow`.  Position must satisfy pos_.liquidity >= pos_.float.
    /// As a side effect, `lend` will modify global reserve `float` by the same amount.
    function lend(bytes32 pid, uint nonce, uint deltaL) public lock(pid, nonce) override returns (uint) {
        if (deltaL > 0) {
            // increment position float factor by `deltaL`
            positions.lend(nonce, pid, deltaL);
        } 

        Reserve.Data storage res = reserves[pid];
        res.addFloat(deltaL); // update global float
        emit Loaned(msg.sender, pid, nonce, deltaL);
        return deltaL;
    }

    /// @notice Reduce a `msg.sender`s float, taking them off the borrow market
    function claim(bytes32 pid, uint nonce, uint deltaL) public lock(pid, nonce) override returns (uint) {
        if (deltaL > 0) {
            // increment position float factor by `deltaL`
            positions.claim(nonce, pid, deltaL);
        }

        Reserve.Data storage res = reserves[pid];
        res.removeFloat(deltaL); // update global float
        emit Claimed(msg.sender, pid, nonce, deltaL);
        return deltaL;
    }

    /// @dev Decrease global float factor by `deltaL`, and increase `recipient` 
    /// debt factor by `deltaL`.  Global debt and float must satisfy
    /// liquidity >= debt + float.
    function borrow(bytes32 pid, address recipient, uint nonce, uint deltaL, uint maxPremium) public lock(pid, nonce) override returns (uint) {
        Reserve.Data storage res = reserves[pid];
        require(res.float >= deltaL, "Insufficient float"); // fail early if not enough float to borrow

        uint liquidity = res.liquidity; // global liquidity balance
        uint deltaX = deltaL * res.RX1 / liquidity; // amount of risky asset
        uint deltaY = deltaL * res.RY2 / liquidity; // amount of riskless asset
        
        // trigger callback before position debt is increased, so liquidity can be removed
        Position.Data storage pos = positions.borrow(nonce, pid, deltaL); // increase liquidity + debt
        // fails if risky asset balance is less than borrowed `deltaL`
        res.borrowFloat(deltaL);
        emit Borrowed(recipient, pid, nonce, deltaL, maxPremium);
        return deltaL;
    }

    
    /// @notice Decreases a position's `loan` debt by decreasing its liquidity. Increases float.
    /// @dev    Reverts if pos.debt is 0, or deltaL >= pos.liquidity (not enough of a balance to pay debt)
    function repay(bytes32 pid, address owner, uint nonce, uint deltaL, bool isInternal) public lock(pid, nonce) override returns (uint deltaX, uint deltaY) {
        if (isInternal) {
            (deltaX, deltaY) = addBoth(pid, owner, nonce, deltaL, true);
        } else {
            IPrimitiveLendingCallbacks(msg.sender).repayFromExternalCallback(pid, owner, nonce, deltaL);
        }

        Reserve.Data storage res = reserves[pid];
        res.addFloat(deltaL);
        emit Repaid(owner, pid, nonce, deltaL);
    }

    // ===== Swaps =====

    
    /// @notice  Swap between risky and riskless assets
    /// @dev     If `addXRemoveY` is true, we request Y out, and must add X to the pool's reserves.///         Else, we request X out, and must add Y to the pool's reserves.
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) public override returns (uint deltaIn) {
        // Fetch internal balances of owner address
        Margin.Data memory margin_ = getMargin(msg.sender);

        // Fetch the global reserves for the `pid` curve
        Reserve.Data storage res = reserves[pid];
        int128 invariant = getInvariantLast(pid); //gas savings
        (uint RX1, uint RY2) = (res.RX1, res.RY2);

        uint postRX1;
        uint postRY2;
        {
            if(addXRemoveY) {
                int128 nextRX1 = calcRX1WithYOut(pid, deltaOut); // remove Y from reserves, and use calculate the new X reserve value.
                postRX1 = nextRX1.parseUnits();
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
            { // avoids stack too deep errors, sending the asset out that we are removing
            uint deltaOut_ = deltaOut;
            address token = xToY ? TY2 : TX1;
            uint preBalance = xToY ? getBY2() : getBX1();
            IERC20(token).safeTransfer(to, deltaOut_);
            uint postBalance = xToY ? getBY2() : getBX1();
            require(postBalance >= preBalance - deltaOut_, "Sent too much tokens");
            }

            if(xToY) {
                margins.withdraw(deltaIn, uint(0));
            } else {
                margins.withdraw(uint(0), deltaIn);
            }
        } else {
            {
            uint deltaOut_ = deltaOut;
            uint deltaIn_ = deltaIn;
            uint preBX1 = getBX1();
            uint preBY2 = getBY2();
            address token = xToY ? TY2 : TX1;
            IERC20(token).safeTransfer(to, deltaOut_);
            IPrimitiveSwapCallback(msg.sender).swapCallback(xToY ? deltaIn_ : 0, xToY ? 0 : deltaIn_);
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
        res.swap(addXRemoveY, deltaIn, deltaOut);
        emit Update(postRX1, postRY2, block.number);
        emit Swap(msg.sender, pid, addXRemoveY, deltaIn, deltaOut_);
    }

    // ===== Swap and Liquidity Math =====

    
    /// @notice  Fetches a new R2 from a decreased R1.
    function calcRY2WithXOut(bytes32 pid, uint deltaXOut) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RX1 = res.RX1 - deltaXOut; // new reserve1 value.
        return SwapMath.calcRY2WithRX1(RX1, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    /// @notice  Fetches a new R1 from a decreased R2.
    function calcRX1WithYOut(bytes32 pid, uint deltaYOut) public view returns (int128) {
        Calibration.Data memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        uint RY2 = res.RY2 - deltaYOut;
        return SwapMath.calcRX1WithRY2(RY2, res.liquidity, cal.strike, cal.sigma, cal.time);
    }

    // ===== View ===== 

    /// @notice Calculates the invariant for `postRX1` and `postRY2` reserve values
    function calcInvariant(bytes32 pid, uint postRX1, uint postRY2, uint postLiquidity) public view override returns (int128 invariant) {
        Calibration.Data memory cal = settings[pid];
        invariant = ReplicationMath.calcInvariant(postRX1, postRY2, postLiquidity, cal.strike, cal.sigma, cal.time);
    }

    /// @notice Calculates the invariant for the current reserve values of a pool.
    function getInvariantLast(bytes32 pid) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[pid];
        invariant = calcInvariant(pid, res.RX1, res.RY2, res.liquidity);
    }

    /// @notice Returns a kaccak256 hash of a pool's calibration parameters
    function getPoolId(uint strike, uint sigma, uint time) public view returns(bytes32 pid) {
        pid = keccak256(
            abi.encodePacked(
                self.time,
                self.sigma,
                self.strike
            )
        );
    }


    /// @notice Returns the length of the allPools array that has all pool Ids
    function getAllPoolsLength() public view override returns (uint len) {
        len = allPools.length;
    }
}
