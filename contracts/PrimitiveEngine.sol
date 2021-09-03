// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Primitive Engine
/// @author  Primitive
/// @dev     Replicating Market Maker

import "./libraries/ABDKMath64x64.sol";
import "./libraries/Margin.sol";
import "./libraries/Position.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Reserve.sol";
import "./libraries/SafeCast.sol";
import "./libraries/Transfers.sol";
import "./libraries/Units.sol";

import "./interfaces/callback/IPrimitiveCreateCallback.sol";
import "./interfaces/callback/IPrimitiveBorrowCallback.sol";
import "./interfaces/callback/IPrimitiveDepositCallback.sol";
import "./interfaces/callback/IPrimitiveLiquidityCallback.sol";
import "./interfaces/callback/IPrimitiveRepayCallback.sol";
import "./interfaces/callback/IPrimitiveSwapCallback.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveFactory.sol";

contract PrimitiveEngine is IPrimitiveEngine {
    using ABDKMath64x64 for *;
    using ReplicationMath for int128;
    using Units for *;
    using SafeCast for *;
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
        uint64 sigma; // volatility of the option, scaled by Mantissa of 1e4
        uint32 maturity; // maturity timestamp of option
        uint32 lastTimestamp; // last timestamp used to calculate time until expiry, "tau"
    }

    /// @inheritdoc IPrimitiveEngineView
    address public immutable override factory;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override risky;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override stable;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override precisionRisky;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override precisionStable;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Calibration) public override calibrations;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => Margin.Data) public override margins;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Position.Data) public override positions;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Reserve.Data) public override reserves;

    uint8 private unlocked = 1;

    modifier lock() {
        if (unlocked != 1) revert LockedError();

        unlocked = 0;
        _;
        unlocked = 1;
    }

    /// @notice Deploys an Engine with two tokens, a 'Risky' and 'Stable'
    constructor() {
        (factory, risky, stable, precisionRisky, precisionStable) = IPrimitiveFactory(msg.sender).args();
    }

    /// @return Risky token balance of this contract
    function balanceRisky() private view returns (uint256) {
        (bool success, bytes memory data) = risky.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        (bool success, bytes memory data) = stable.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @notice Revert if expected do not exceed current balances
    function checkRiskyBalance(uint256 expectedRisky) private view {
        uint256 actualRisky = balanceRisky();
        if (actualRisky < expectedRisky) revert RiskyBalanceError(expectedRisky, actualRisky);
    }

    /// @notice Revert if expected do not exceed current balances
    function checkStableBalance(uint256 expectedStable) private view {
        uint256 actualStable = balanceStable();
        if (actualStable < expectedStable) revert StableBalanceError(expectedStable, actualStable);
    }

    /// @return blockTimestamp casted as a uint32
    function _blockTimestamp() internal view virtual returns (uint32 blockTimestamp) {
        // solhint-disable-next-line
        blockTimestamp = uint32(block.timestamp);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function updateLastTimestamp(bytes32 poolId) external override returns (uint32 lastTimestamp) {
        lastTimestamp = _updateLastTimestamp(poolId);
    }

    /// @return lastTimestamp of the pool, used in calculating the time until expiry
    function _updateLastTimestamp(bytes32 poolId) internal virtual returns (uint32 lastTimestamp) {
        Calibration storage cal = calibrations[poolId];
        if (cal.lastTimestamp == 0) revert UninitializedError();
        lastTimestamp = _blockTimestamp();
        uint32 maturity = cal.maturity;
        if (lastTimestamp > maturity) lastTimestamp = maturity; // if expired, set to the maturity
        cal.lastTimestamp = lastTimestamp;
        emit UpdatedTimestamp(poolId, lastTimestamp);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function create(
        uint256 strike,
        uint64 sigma,
        uint32 maturity,
        uint256 delta,
        uint256 delLiquidity,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            bytes32 poolId,
            uint256 delRisky,
            uint256 delStable
        )
    {
        uint256 scaledStrike = strike.scaleDown(precisionStable); // strike is 18 decimals, scale down
        poolId = keccak256(abi.encodePacked(address(this), scaledStrike, sigma, maturity));

        if (calibrations[poolId].lastTimestamp != 0) revert PoolDuplicateError();

        Calibration memory cal = Calibration({
            strike: scaledStrike.toUint128(),
            sigma: sigma.toUint64(),
            maturity: maturity,
            lastTimestamp: _blockTimestamp()
        });

        uint32 tau = cal.maturity - cal.lastTimestamp; // time until expiry
        delRisky = 1e18 - delta; // 18 decimals of precision, 0 < delta < 1
        (uint256 prec0, uint256 prec1) = (precisionRisky, precisionStable);
        delRisky = delRisky.scaleDown(prec0); // 18 decimals of precision -> native risky precision
        delStable = ReplicationMath.getStableGivenRisky(0, prec0, prec1, delRisky, cal.strike, cal.sigma, tau); // stable precision
        delRisky = (delRisky * delLiquidity) / 1e18; // native risky precision
        delStable = (delStable * delLiquidity) / 1e18; // native stable precision

        if (delRisky * delStable == 0) revert CalibrationError(delRisky, delStable);

        {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
            checkRiskyBalance(balRisky + delRisky);
            checkStableBalance(balStable + delStable);
        }

        calibrations[poolId] = cal; // initialize calibration
        reserves[poolId].allocate(delRisky, delStable, delLiquidity, cal.lastTimestamp); // provide liquidity
        positions.fetch(msg.sender, poolId).allocate(delLiquidity - 1000); // burn 1000 wei, at cost of msg.sender
        emit Created(msg.sender, cal.strike, cal.sigma, cal.maturity);
    }

    // ===== Margin =====

    /// @inheritdoc IPrimitiveEngineActions
    function deposit(
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external override lock {
        uint256 balRisky;
        uint256 balStable;
        if (delRisky > 0) balRisky = balanceRisky();
        if (delStable > 0) balStable = balanceStable();
        IPrimitiveDepositCallback(msg.sender).depositCallback(delRisky, delStable, data); // agnostic payment
        checkRiskyBalance(balRisky + delRisky);
        checkStableBalance(balStable + delStable);

        margins[recipient].deposit(delRisky, delStable); // adds to risky and/or stable token balances
        emit Deposited(msg.sender, recipient, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function withdraw(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) external override lock {
        margins.withdraw(delRisky, delStable); // removes risky and/or stable token balances from `msg.sender`
        if (delRisky > 0) IERC20(risky).safeTransfer(recipient, delRisky);
        if (delStable > 0) IERC20(stable).safeTransfer(recipient, delStable);
        emit Withdrawn(msg.sender, recipient, delRisky, delStable);
    }

    // ===== Liquidity =====

    /// @inheritdoc IPrimitiveEngineActions
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        Reserve.Data storage reserve = reserves[poolId];
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        if (_blockTimestamp() > calibrations[poolId].maturity) revert PoolExpiredError();

        (delRisky, delStable) = reserve.getAmounts(delLiquidity); // amounts to allocate
        if (delRisky * delStable == 0) revert ZeroDeltasError();

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data); // agnostic payment
            checkRiskyBalance(balRisky + delRisky);
            checkStableBalance(balStable + delStable);
        }

        positions.fetch(recipient, poolId).allocate(delLiquidity); // increase position liquidity
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp()); // increase reserves and liquidity
        emit Allocated(msg.sender, recipient, poolId, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(bytes32 poolId, uint256 delLiquidity)
        external
        override
        lock
        returns (uint256 delRisky, uint256 delStable)
    {
        Reserve.Data storage reserve = reserves[poolId];
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        (delRisky, delStable) = reserve.getAmounts(delLiquidity); // amounts from removing, one side can be 0

        positions.remove(poolId, delLiquidity); // update position liquidity of msg.sender
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // update global reserves
        margins[msg.sender].deposit(delRisky, delStable); // increase margin of msg.sender
        emit Removed(msg.sender, poolId, delRisky, delStable);
    }

    struct SwapDetails {
        bytes32 poolId;
        uint256 deltaIn;
        bool riskyForStable;
        bool fromMargin;
        uint32 timestamp;
    }

    /// @inheritdoc IPrimitiveEngineActions
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 deltaOut) {
        if (deltaIn == 0) revert DeltaInError();

        SwapDetails memory details = SwapDetails({
            poolId: poolId,
            deltaIn: deltaIn,
            riskyForStable: riskyForStable,
            fromMargin: fromMargin,
            timestamp: _blockTimestamp()
        });

        uint32 lastTimestamp = _updateLastTimestamp(details.poolId); // the pool's timestamp, after being updated
        if (details.timestamp > lastTimestamp + 120) revert PoolExpiredError(); // 120s buffer to allow final swaps
        int128 invariantX64 = invariantOf(details.poolId); // stored in memory to perform the invariant check

        {
            // reserve scope
            Calibration memory cal = calibrations[details.poolId];
            Reserve.Data storage reserve = reserves[details.poolId];
            bool swapInRisky = details.riskyForStable;
            uint32 tau = cal.maturity - cal.lastTimestamp;
            uint256 fee = (details.deltaIn * 15) / 1e4;
            uint256 deltaInWithFee = details.deltaIn - fee;
            uint256 riskyAfter; // per liquidity
            uint256 stableAfter; // per liquidity

            if (swapInRisky) {
                riskyAfter = ((reserve.reserveRisky + deltaInWithFee) * 1e18) / reserve.liquidity; // native precision
                stableAfter = invariantX64.getStableGivenRisky(
                    precisionRisky,
                    precisionStable,
                    riskyAfter,
                    cal.strike,
                    cal.sigma,
                    tau
                );
                deltaOut = reserve.reserveStable - (stableAfter * reserve.liquidity) / 1e18; // native stable precision
            } else {
                stableAfter = ((reserve.reserveStable + deltaInWithFee) * 1e18) / reserve.liquidity; // native precision
                riskyAfter = invariantX64.getRiskyGivenStable(
                    precisionRisky,
                    precisionStable,
                    stableAfter,
                    cal.strike,
                    cal.sigma,
                    tau
                );
                deltaOut = reserve.reserveRisky - (riskyAfter * reserve.liquidity) / 1e18; // native risky precision
            }

            int128 invariantAfter = ReplicationMath.calcInvariant(
                precisionRisky,
                precisionStable,
                riskyAfter,
                stableAfter,
                cal.strike,
                cal.sigma,
                tau
            );

            if (invariantAfter > 0) {
                reserve.swap(swapInRisky, deltaInWithFee, deltaOut, _blockTimestamp());
                if (reserve.float > 0) reserve.addFee(swapInRisky ? fee : 0, swapInRisky ? 0 : fee);
            } else {
                reserve.swap(swapInRisky, details.deltaIn, deltaOut, _blockTimestamp());
            }

            invariantAfter = invariantOf(details.poolId);
            if (invariantX64 > invariantAfter && invariantX64.sub(invariantAfter) >= int128(184467441000000000))
                revert InvariantError(invariantX64, invariantAfter);
        }

        if (deltaOut == 0) revert DeltaOutError();

        if (details.riskyForStable) {
            IERC20(stable).safeTransfer(msg.sender, deltaOut); // send proceeds, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(deltaIn, 0); // pay for swap
            } else {
                uint256 balRisky = balanceRisky();
                IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // agnostic payment
                checkRiskyBalance(balRisky + details.deltaIn);
            }
        } else {
            IERC20(risky).safeTransfer(msg.sender, deltaOut); // send proceeds first, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(0, deltaIn); // pay for swap
            } else {
                uint256 balStable = balanceStable();
                IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // agnostic payment
                checkStableBalance(balStable + details.deltaIn);
            }
        }

        emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, deltaOut);
    }

    // ===== Convexity =====

    /// @inheritdoc IPrimitiveEngineActions
    function supply(bytes32 poolId, uint256 delLiquidity) external override lock {
        if (calibrations[poolId].lastTimestamp == 0) revert UninitializedError();
        if (delLiquidity == 0) revert ZeroLiquidityError();

        Reserve.Data storage reserve = reserves[poolId];
        Position.Data storage position = positions.fetch(msg.sender, poolId);
        (uint256 feeRisky, uint256 feeStable) = position.updateFeeGrowth(
            reserve.feeRiskyGrowth,
            reserve.feeStableGrowth
        );

        margins[msg.sender].deposit(feeRisky, feeStable);
        positions.supply(poolId, delLiquidity); // increase position float by `delLiquidity`
        reserve.addFloat(delLiquidity); // increase global float
        emit Supplied(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function claim(bytes32 poolId, uint256 delLiquidity) external override lock {
        if (calibrations[poolId].lastTimestamp == 0) revert UninitializedError();
        if (delLiquidity == 0) revert ZeroLiquidityError();

        Reserve.Data storage reserve = reserves[poolId];
        Position.Data storage position = positions.fetch(msg.sender, poolId);
        (uint256 feeRisky, uint256 feeStable) = position.updateFeeGrowth(
            reserve.feeRiskyGrowth,
            reserve.feeStableGrowth
        );

        margins[msg.sender].deposit(feeRisky, feeStable); // increase margin of msg.sender
        positions.claim(poolId, delLiquidity); // reduce float by `delLiquidity`
        reserve.removeFloat(delLiquidity); // reduce global float
        emit Claimed(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function borrow(
        bytes32 poolId,
        uint256 collateralRisky,
        uint256 collateralStable,
        bool fromMargin,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            uint256 riskyDeficit,
            uint256 riskySurplus,
            uint256 stableDeficit,
            uint256 stableSurplus
        )
    {
        // Source: Convex Payoff Approximation. https://stanford.edu/~guillean/papers/cfmm-lending.pdf. Section 5.
        Calibration memory cal = calibrations[poolId];
        if (cal.lastTimestamp == 0) revert UninitializedError();
        if (collateralRisky == 0 && collateralStable == 0) revert ZeroLiquidityError();
        if (_blockTimestamp() > cal.maturity) revert PoolExpiredError();

        positions.borrow(poolId, collateralRisky, collateralStable);

        {
            // liquidity scope
            Reserve.Data storage reserve = reserves[poolId];
            (uint256 delLiquidity, uint256 delRisky, uint256 delStable) = reserve.getBorrowAmounts(
                collateralRisky,
                collateralStable,
                precisionRisky,
                precisionStable,
                uint256(cal.strike)
            );

            if (collateralRisky > delRisky) riskyDeficit = collateralRisky - delRisky;
            else riskySurplus = delRisky - collateralRisky;
            if (collateralStable > delStable) stableDeficit = collateralStable - delStable;
            else stableSurplus = delStable - collateralStable;

            uint256 feeRisky = (riskyDeficit * 30) / 1e4;
            uint256 feeStable = (stableDeficit * 30) / 1e4;
            riskyDeficit += feeRisky;
            stableDeficit += feeStable;

            reserve.addFee(feeRisky, feeStable);
            reserve.borrowFloat(delLiquidity); // decrease: global float, increase: global debt
            reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // decrease: risky, stable, liquidity
        }

        if (fromMargin) {
            margins.withdraw(riskyDeficit, stableDeficit); // receive deficits
            margins[msg.sender].deposit(riskySurplus, stableSurplus); // send surpluses
        } else {
            if (riskySurplus > 0) IERC20(risky).safeTransfer(msg.sender, riskySurplus); // send surpluses
            if (stableSurplus > 0) IERC20(stable).safeTransfer(msg.sender, stableSurplus); // send surpluses

            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable()); // notice line placement
            IPrimitiveBorrowCallback(msg.sender).borrowCallback(riskyDeficit, stableDeficit, data); // request deficits

            checkRiskyBalance(balRisky + riskyDeficit);
            checkStableBalance(balStable + stableDeficit);
        }

        emit Borrowed(
            msg.sender,
            poolId,
            collateralRisky,
            collateralStable,
            riskyDeficit,
            riskySurplus,
            stableDeficit,
            stableSurplus
        );
    }

    /// @inheritdoc IPrimitiveEngineActions
    function repay(
        bytes32 poolId,
        address recipient,
        uint256 collateralRisky,
        uint256 collateralStable,
        bool fromMargin,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            uint256 riskyDeficit,
            uint256 riskySurplus,
            uint256 stableDeficit,
            uint256 stableSurplus
        )
    {
        Calibration memory cal = calibrations[poolId];
        if (cal.lastTimestamp == 0) revert UninitializedError();

        {
            // position scope
            bytes32 id = poolId;
            bool expired = _blockTimestamp() >= cal.maturity + 86400;
            address account = expired ? recipient : msg.sender;
            positions.fetch(account, id).repay(collateralRisky, collateralStable); // increase: risky/collateralStable
        }

        {
            // liquidity scope
            Reserve.Data storage reserve = reserves[poolId];
            (uint256 delLiquidity, uint256 delRisky, uint256 delStable) = reserve.getBorrowAmounts(
                collateralRisky,
                collateralStable,
                precisionRisky,
                precisionStable,
                uint256(cal.strike)
            );

            if (delRisky > collateralRisky) riskyDeficit = delRisky - collateralRisky;
            else riskySurplus = collateralRisky - delRisky;
            if (delStable > collateralStable) stableDeficit = delStable - collateralStable;
            else stableSurplus = collateralStable - delStable;

            reserve.repayFloat(delLiquidity); // increase: float, decrease: debt
            reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp()); // incr.: risky, stable, liquidity
        }

        if (fromMargin) {
            margins.withdraw(riskyDeficit, stableDeficit); // receive deficits
            margins[msg.sender].deposit(riskySurplus, stableSurplus); // send surpluses
        } else {
            if (riskySurplus > 0) IERC20(risky).safeTransfer(msg.sender, riskySurplus); // send surpluses
            if (stableSurplus > 0) IERC20(stable).safeTransfer(msg.sender, stableSurplus); // send surpluses

            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable()); // notice line placement
            IPrimitiveRepayCallback(msg.sender).repayCallback(riskyDeficit, stableDeficit, data); // request deficits

            checkRiskyBalance(balRisky + riskyDeficit);
            checkStableBalance(balStable + stableDeficit);
        }

        emit Repaid(
            msg.sender,
            recipient,
            poolId,
            collateralRisky,
            collateralStable,
            riskyDeficit,
            riskySurplus,
            stableDeficit,
            stableSurplus
        );
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory reserve = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        uint32 tau = cal.maturity - cal.lastTimestamp;
        (uint256 riskyPerLiquidity, uint256 stablePerLiquidity) = reserve.getAmounts(1e18);
        invariant = ReplicationMath.calcInvariant(
            precisionRisky,
            precisionStable,
            riskyPerLiquidity,
            stablePerLiquidity,
            cal.strike,
            cal.sigma,
            tau
        );
    }
}
