// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @title   Primitive Engine
/// @author  Primitive
/// @dev     Create pools with parameters `Calibration` to replicate Black-scholes covered call payoffs.

import "./libraries/ABDKMath64x64.sol";
import "./libraries/BlackScholes.sol";
import "./libraries/Margin.sol";
import "./libraries/Position.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Reserve.sol";
import "./libraries/Units.sol";
import "./libraries/Transfers.sol";

import "./interfaces/callback/IPrimitiveLendingCallback.sol";
import "./interfaces/callback/IPrimitiveLiquidityCallback.sol";
import "./interfaces/callback/IPrimitiveMarginCallback.sol";
import "./interfaces/callback/IPrimitiveSwapCallback.sol";
import "./interfaces/callback/IPrimitiveCreateCallback.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveFactory.sol";

import "hardhat/console.sol";

contract PrimitiveEngine is IPrimitiveEngine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
    using ReplicationMath for int128;
    using Units for *;
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Reserve for Reserve.Data;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;
    using Transfers for IERC20;

    /// @dev Parameters of each pool
    struct Calibration {
        uint128 strike; // strike price of the option
        uint64 sigma; // implied volatility of the option
        uint64 time; // the time in seconds until the option expires
    }

    /// @inheritdoc IPrimitiveEngineView
    address public immutable override factory;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override risky;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override stable;

    uint8 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "Locked");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Calibration) public override settings;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => Margin.Data) public override margins;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Position.Data) public override positions;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Reserve.Data) public override reserves;

    /// @notice Deploys an Engine with two tokens, a 'Risky' and 'Stable'
    constructor() {
        (factory, risky, stable) = IPrimitiveFactory(msg.sender).args();
    }

    /// @notice Returns the risky token balance of this contract
    function balanceRisky() private view returns (uint256) {
        return IERC20(risky).balanceOf(address(this));
    }

    /// @notice Returns the stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        return IERC20(stable).balanceOf(address(this));
    }

    /// @notice Block timestamp... but casted as a uint32
    function _blockTimestamp() internal view returns (uint32 blockTimestamp) {
        // solhint-disable-next-line
        blockTimestamp = uint32(block.timestamp);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function create(
        uint256 strike,
        uint256 sigma,
        uint256 time,
        uint256 riskyPrice,
        uint256 delLiquidity,
        bytes calldata data
    ) external override returns (bytes32 pid) {
        // NOTE: Splitting the requires might save some gas
        require(time > 0 && sigma > 0 && strike > 0, "Calibration cannot be 0");
        require(delLiquidity > 0, "Liquidity cannot be 0");
        pid = getPoolId(strike, sigma, time);

        require(settings[pid].time == 0, "Already created");
        settings[pid] = Calibration({strike: uint128(strike), sigma: uint64(sigma), time: uint64(time)});

        int128 delta = BlackScholes.deltaCall(riskyPrice, strike, sigma, time);
        uint256 RX1 = uint256(1).fromUInt().sub(delta).parseUnits();
        uint256 RY2 = ReplicationMath.getTradingFunction(RX1, 1e18, strike, sigma, time).parseUnits();
        reserves[pid] = Reserve.Data({
            reserveRisky: uint128((RX1 * delLiquidity) / 1e18), // risky token balance
            reserveStable: uint128((RY2 * delLiquidity) / 1e18), // stable token balance
            liquidity: uint128(delLiquidity), // 1 unit
            float: 0, // the LP shares available to be borrowed on a given pid
            debt: 0, // the LP shares borrowed from the float
            blockTimestamp: _blockTimestamp(),
            cumulativeRisky: 0,
            cumulativeStable: 0,
            cumulativeLiquidity: 0
        });

        uint256 balRisky = balanceRisky();
        uint256 balStable = balanceStable();
        IPrimitiveCreateCallback(msg.sender).createCallback(RX1, RY2, data);
        require(balanceRisky() >= RX1 + balRisky, "Not enough risky tokens");
        require(balanceStable() >= RY2 + balStable, "Not enough stable tokens");
        positions.fetch(msg.sender, pid).allocate(delLiquidity - 1000); // give liquidity to `msg.sender`, burn 1000 wei
        emit Create(msg.sender, pid, strike, sigma, time);
    }

    // ===== Margin =====

    /// @inheritdoc IPrimitiveEngineActions
    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external override lock {
        uint256 balRisky = balanceRisky();
        uint256 balStable = balanceStable();
        IPrimitiveMarginCallback(msg.sender).depositCallback(delRisky, delStable, data); // receive tokens
        if (delRisky > 0) require(balanceRisky() >= balRisky + delRisky, "Not enough risky");
        if (delStable > 0) require(balanceStable() >= balStable + delStable, "Not enough stable");

        Margin.Data storage margin = margins[owner];
        margin.deposit(delRisky, delStable); // adds to risky and/or stable token balances
        emit Deposited(msg.sender, owner, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function withdraw(uint256 delRisky, uint256 delStable) external override lock {
        margins.withdraw(delRisky, delStable); // removes risky and/or stable token balances from `msg.sender`
        if (delRisky > 0) IERC20(risky).safeTransfer(msg.sender, delRisky);
        if (delStable > 0) IERC20(stable).safeTransfer(msg.sender, delStable);
        emit Withdrawn(msg.sender, delRisky, delStable);
    }

    // ===== Liquidity =====

    /// @inheritdoc IPrimitiveEngineActions
    function allocate(
        bytes32 pid,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external override returns (uint256 delRisky, uint256 delStable) {
        Reserve.Data storage res = reserves[pid];
        (uint256 liquidity, uint256 RX1, uint256 RY2) = (res.liquidity, res.reserveRisky, res.reserveStable);
        require(liquidity > 0, "Not initialized");

        delRisky = (delLiquidity * RX1) / liquidity;
        delStable = (delLiquidity * RY2) / liquidity;
        require(delRisky * delStable > 0, "Deltas are 0");

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            uint256 balRisky = balanceRisky();
            uint256 balStable = balanceStable();
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data);
            require(balanceRisky() >= balRisky + delRisky, "Not enough risky");
            require(balanceStable() >= balStable + delStable, "Not enough stable");
        }

        bytes32 pid_ = pid;
        Position.Data storage pos = positions.fetch(owner, pid_);
        pos.allocate(delLiquidity);
        res.allocate(delRisky, delStable, delLiquidity, _blockTimestamp());
        emit Allocated(msg.sender, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(
        bytes32 pid,
        uint256 delLiquidity,
        bool isInternal,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        require(delLiquidity > 0, "Cannot be 0");
        Reserve.Data storage res = reserves[pid];

        uint256 reserveX;
        uint256 reserveY;

        {
            // scope for calculting invariants
            (uint256 RX1, uint256 RY2, uint256 liquidity) = (res.reserveRisky, res.reserveStable, res.liquidity);
            require(liquidity >= delLiquidity, "Above max burn");
            delRisky = (delLiquidity * RX1) / liquidity;
            delStable = (delLiquidity * RY2) / liquidity;
            require(delRisky * delStable > 0, "Deltas are 0");
            reserveX = RX1 - delRisky;
            reserveY = RY2 - delStable;
        }

        // Updated state
        if (isInternal) {
            Margin.Data storage margin = margins[msg.sender];
            margin.deposit(delRisky, delStable);
        } else {
            uint256 balRisky = balanceRisky();
            uint256 balStable = balanceStable();
            IERC20(risky).safeTransfer(msg.sender, delRisky);
            IERC20(stable).safeTransfer(msg.sender, delStable);
            IPrimitiveLiquidityCallback(msg.sender).removeCallback(delRisky, delStable, data);
            require(balanceRisky() >= balRisky - delRisky, "Not enough risky");
            require(balanceStable() >= balStable - delStable, "Not enough stable");
        }

        positions.remove(pid, delLiquidity); // Updated position liqudiity
        res.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
        emit Removed(msg.sender, delRisky, delStable);
    }

    struct SwapDetails {
        bytes32 poolId;
        uint256 amountOut;
        uint256 amountInMax;
        bool riskyForStable;
        bool fromMargin;
    }

    /// @inheritdoc IPrimitiveEngineActions
    /// @dev     If `riskyForStable` is true, we request Y out, and must add X to the pool's reserves.
    ///         Else, we request X out, and must add Y to the pool's reserves.
    function swap(
        bytes32 pid,
        bool riskyForStable,
        uint256 deltaOut,
        uint256 deltaInMax,
        bool fromMargin,
        bytes calldata data
    ) external override returns (uint256 deltaIn) {
        SwapDetails memory details =
            SwapDetails({
                poolId: pid,
                amountOut: deltaOut,
                amountInMax: deltaInMax,
                riskyForStable: riskyForStable,
                fromMargin: fromMargin
            });

        int128 invariant = invariantOf(details.poolId); // gas savings
        Reserve.Data storage res = reserves[details.poolId]; // gas savings
        (uint256 RX1, uint256 RY2) = (res.reserveRisky, res.reserveStable);

        uint256 reserveX;
        uint256 reserveY;

        if (details.riskyForStable) {
            int128 nextRX1 = compute(details.poolId, risky, RY2 - details.amountOut); // remove Y from reserves, and use calculate the new X reserve value.
            reserveX = nextRX1.sub(invariant).parseUnits();
            reserveY = RY2 - details.amountOut;
            deltaIn = ((reserveX - RX1) * 10000) / 9985; // nextRX1 = RX1 + detlaIn * (1 - fee)
        } else {
            int128 nextRY2 = compute(details.poolId, stable, RX1 - details.amountOut); // subtract X from reserves, and use to calculate the new Y reserve value.
            reserveX = RX1 - details.amountOut;
            reserveY = invariant.add(nextRY2).parseUnits();
            deltaIn = ((reserveY - RY2) * 10000) / 9985;
        }

        require(details.amountInMax >= deltaIn, "Too expensive");
        require(
            calcInvariant(details.poolId, reserveX, reserveY, res.liquidity).parseUnits() >= invariant.parseUnits(),
            "Invalid invariant"
        );

        {
            // avoids stack too deep errors
            uint256 amountIn = deltaIn;
            if (details.fromMargin) {
                if (details.riskyForStable) {
                    margins.withdraw(amountIn, uint256(0));
                    uint256 balStable = balanceStable();
                    IERC20(stable).safeTransfer(msg.sender, details.amountOut);
                    require(balanceStable() >= balStable - details.amountOut, "Sent too much tokens");
                } else {
                    margins.withdraw(uint256(0), amountIn);
                    uint256 balRisky = balanceRisky();
                    IERC20(risky).safeTransfer(msg.sender, details.amountOut);
                    require(balanceRisky() >= balRisky - details.amountOut, "Sent too much tokens");
                }
            } else {
                if (details.riskyForStable) {
                    uint256 balRisky = balanceRisky();
                    IPrimitiveSwapCallback(msg.sender).swapCallback(amountIn, 0, data);
                    require(balanceRisky() >= balRisky + amountIn, "Not enough risky");

                    uint256 balStable = balanceStable();
                    IERC20(stable).safeTransfer(msg.sender, details.amountOut);
                    require(balanceStable() >= balStable - details.amountOut, "Sent too much tokens");
                } else {
                    uint256 balStable = balanceStable();
                    IPrimitiveSwapCallback(msg.sender).swapCallback(0, amountIn, data);
                    require(balanceStable() >= balStable + amountIn, "Not enough risky");

                    uint256 balRisky = balanceRisky();
                    IERC20(risky).safeTransfer(msg.sender, details.amountOut);
                    require(balanceRisky() >= balRisky - details.amountOut, "Sent too much tokens");
                }
            }

            res.swap(details.riskyForStable, amountIn, details.amountOut, _blockTimestamp());
            emit Swapped(msg.sender, details.poolId, details.riskyForStable, amountIn, details.amountOut);
        }
    }

    // ===== Lending =====

    /// @inheritdoc IPrimitiveEngineActions
    function lend(bytes32 pid, uint256 delLiquidity) external override lock {
        require(delLiquidity > 0, "Cannot be zero");
        positions.lend(pid, delLiquidity); // increment position float factor by `delLiquidity`

        Reserve.Data storage res = reserves[pid];
        res.addFloat(delLiquidity); // update global float
        emit Loaned(msg.sender, pid, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function claim(bytes32 pid, uint256 delLiquidity) external override lock {
        require(delLiquidity > 0, "Cannot be zero");
        positions.claim(pid, delLiquidity); // increment position float factor by `delLiquidity`

        Reserve.Data storage res = reserves[pid];
        res.removeFloat(delLiquidity); // update global float
        emit Claimed(msg.sender, pid, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function borrow(
        bytes32 pid,
        address recipient,
        uint256 delLiquidity,
        uint256 maxPremium,
        bytes calldata data
    ) external override lock {
        Reserve.Data storage res = reserves[pid];
        {
            uint256 delLiquidity = delLiquidity;
            require(res.float >= delLiquidity && delLiquidity > 0, "Insufficient float"); // fail early if not enough float to borrow

            uint256 liquidity = res.liquidity; // global liquidity balance
            uint256 delRisky = (delLiquidity * res.reserveRisky) / liquidity; // amount of risky asset
            uint256 delStable = (delLiquidity * res.reserveStable) / liquidity; // amount of stable asset

            {
                uint256 preRisky = IERC20(risky).balanceOf(address(this));
                uint256 preRiskless = IERC20(stable).balanceOf(address(this));

                // trigger callback before position debt is increased, so liquidity can be removed
                IERC20(stable).safeTransfer(msg.sender, delStable);
                IPrimitiveLendingCallback(msg.sender).borrowCallback(delLiquidity, delRisky, delStable, data); // trigger the callback so we can remove liquidity
                positions.borrow(pid, delLiquidity); // increase liquidity + debt
                // fails if risky asset balance is less than borrowed `delLiquidity`
                res.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
                res.borrowFloat(delLiquidity);

                uint256 postRisky = IERC20(risky).balanceOf(address(this));
                uint256 postRiskless = IERC20(stable).balanceOf(address(this));

                require(postRisky >= preRisky + (delLiquidity - delRisky), "IRY");
                require(postRiskless >= preRiskless - delStable, "IRL");
            }

            emit Borrowed(recipient, pid, delLiquidity, maxPremium);
        }
    }

    /// @inheritdoc IPrimitiveEngineActions
    /// @dev    Reverts if pos.debt is 0, or delLiquidity >= pos.liquidity (not enough of a balance to pay debt)
    function repay(
        bytes32 pid,
        address owner,
        uint256 delLiquidity,
        bool isInternal,
        bytes calldata data
    ) external override lock returns (uint256 deltaRisky, uint256 deltaStable) {
        Reserve.Data storage res = reserves[pid];
        Position.Data storage pos = positions.fetch(owner, pid);
        Margin.Data storage margin = margins[owner];

        require(res.debt >= delLiquidity && (int256(pos.liquidity)) >= int256(delLiquidity), "ID");

        deltaRisky = (delLiquidity * res.reserveRisky) / res.liquidity;
        deltaStable = (delLiquidity * res.reserveStable) / res.liquidity;

        if (isInternal) {
            margins.withdraw(delLiquidity - deltaRisky, deltaStable);

            res.allocate(deltaRisky, deltaStable, delLiquidity, _blockTimestamp());
            pos.repay(delLiquidity);
        } else {
            uint256 preStable = IERC20(stable).balanceOf(address(this));
            IPrimitiveLendingCallback(msg.sender).repayFromExternalCallback(deltaStable, data);

            require(IERC20(stable).balanceOf(address(this)) >= preStable + deltaStable, "IS");

            res.allocate(deltaRisky, deltaStable, delLiquidity, _blockTimestamp());
            res.repayFloat(delLiquidity);
            pos.repay(delLiquidity);
            margin.deposit(delLiquidity - deltaRisky, uint256(0));
        }

        emit Repaid(owner, pid, delLiquidity);
    }

    // ===== Swap and Liquidity Math =====

    /// @inheritdoc IPrimitiveEngineView
    function compute(
        bytes32 pid,
        address token,
        uint256 reserve
    ) public view override returns (int128 reserveOfToken) {
        require(token == risky || token == stable, "Not an engine token");
        Calibration memory cal = settings[pid];
        Reserve.Data memory res = reserves[pid];
        if (token == stable) {
            reserveOfToken = ReplicationMath.getTradingFunction(
                reserve,
                res.liquidity,
                uint256(cal.strike),
                uint256(cal.sigma),
                uint256(cal.time)
            );
        } else {
            reserveOfToken = ReplicationMath.getInverseTradingFunction(
                reserve,
                res.liquidity,
                uint256(cal.strike),
                uint256(cal.sigma),
                uint256(cal.time)
            );
        }
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function calcInvariant(
        bytes32 pid,
        uint256 reserveX,
        uint256 reserveY,
        uint256 postLiquidity
    ) public view override returns (int128 invariant) {
        Calibration memory cal = settings[pid];
        invariant = ReplicationMath.calcInvariant(
            reserveX,
            reserveY,
            postLiquidity,
            uint256(cal.strike),
            uint256(cal.sigma),
            uint256(cal.time)
        );
    }

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 pid) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[pid];
        invariant = calcInvariant(pid, res.reserveRisky, res.reserveStable, res.liquidity);
    }

    /// @inheritdoc IPrimitiveEngineView
    function getPoolId(
        uint256 strike,
        uint256 sigma,
        uint256 time
    ) public view override returns (bytes32 pid) {
        pid = keccak256(abi.encodePacked(factory, time, sigma, strike));
    }

    // ===== Flashes =====

    /// @inheritdoc IERC3156FlashLender
    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {
        uint256 fee_ = flashFee(token, amount); // reverts if unsupported token
        uint256 balance = token == stable ? balanceStable() : balanceRisky();
        IERC20(token).safeTransfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(msg.sender, token, amount, fee_, data) ==
                keccak256("ERC3156FlashBorrower.onFlashLoan"),
            "IERC3156: Callback failed"
        );

        uint256 balanceAfter = token == stable ? balanceStable() : balanceRisky();
        require(balance + fee_ <= balanceAfter, "Not enough returned");
        uint256 payment = balanceAfter - balance;

        emit Flash(msg.sender, address(receiver), token, amount, payment);
        return true;
    }

    /// @inheritdoc IERC3156FlashLender
    function flashFee(address token, uint256 amount) public view override returns (uint256) {
        require(token == stable || token == risky, "Not supported");
        return (amount * 15) / 10000;
    }

    /// @inheritdoc IERC3156FlashLender
    function maxFlashLoan(address token) external view override returns (uint256) {
        if (token != stable || token != risky) return 0; // not supported
        return token == stable ? balanceStable() : balanceRisky();
    }
}
