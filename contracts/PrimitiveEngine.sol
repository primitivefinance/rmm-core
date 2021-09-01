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
        (factory, risky, stable) = IPrimitiveFactory(msg.sender).args();
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
        lastTimestamp = _blockTimestamp();
        uint32 maturity = calibrations[poolId].maturity;
        if (lastTimestamp > maturity) lastTimestamp = maturity; // if expired, set to the maturity
        calibrations[poolId].lastTimestamp = lastTimestamp;
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
        poolId = keccak256(abi.encodePacked(address(this), strike, sigma, maturity));

        if (calibrations[poolId].lastTimestamp != 0) revert PoolDuplicateError();

        uint32 timestamp = _blockTimestamp();
        Calibration memory cal = Calibration({
            strike: strike.toUint128(),
            sigma: sigma,
            maturity: maturity,
            lastTimestamp: timestamp
        });

        uint32 tau = cal.maturity - timestamp; // time until expiry
        delRisky = 1e18 - delta; // 0 <= delta <= 1
        delStable = ReplicationMath.getStableGivenRisky(0, delRisky, cal.strike, cal.sigma, tau).parseUnits();
        delRisky = (delRisky * delLiquidity) / 1e18;
        delStable = (delStable * delLiquidity) / 1e18;

        if (delRisky * delStable == 0) revert CalibrationError(delRisky, delStable);

        (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
        IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
        if (balanceRisky() < delRisky + balRisky) revert RiskyBalanceError(delRisky + balRisky, balanceRisky());
        if (balanceStable() < delStable + balStable) revert StableBalanceError(delStable + balStable, balanceStable());

        calibrations[poolId] = cal; // initialize calibration
        reserves[poolId].allocate(delRisky, delStable, delLiquidity, timestamp); // provide liquidity
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
        if (balanceRisky() < balRisky + delRisky) revert RiskyBalanceError(balRisky + delRisky, balanceRisky());
        if (balanceStable() < balStable + delStable) revert StableBalanceError(balStable + delStable, balanceStable());

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
            if (balanceRisky() < balRisky + delRisky) revert RiskyBalanceError(balRisky + delRisky, balanceRisky());
            if (balanceStable() < balStable + delStable)
                revert StableBalanceError(balStable + delStable, balanceStable());
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
        (delRisky, delStable) = reserve.getAmounts(delLiquidity); // amounts from removing

        if (delRisky * delStable == 0) revert ZeroDeltasError();

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
        int128 invariant = invariantOf(details.poolId); // stored in memory to perform the invariant check

        {
            // reserve scope
            Calibration memory cal = calibrations[details.poolId];
            Reserve.Data storage reserve = reserves[details.poolId];
            bool swapInRisky = details.riskyForStable;
            uint256 tau = cal.maturity - cal.lastTimestamp;
            uint256 fee = (details.deltaIn * 15) / 1e4;
            uint256 deltaInWithFee = details.deltaIn - fee;
            uint256 riskyAfter; // per liquidity
            uint256 stableAfter; // per liquidity

            if (swapInRisky) {
                riskyAfter = ((reserve.reserveRisky + deltaInWithFee) * 1e18) / reserve.liquidity;
                stableAfter = invariant.getStableGivenRisky(riskyAfter, cal.strike, cal.sigma, tau).parseUnits();
                deltaOut = reserve.reserveStable - (stableAfter * reserve.liquidity) / 1e18;
            } else {
                stableAfter = ((reserve.reserveStable + deltaInWithFee) * 1e18) / reserve.liquidity;
                riskyAfter = invariant.getRiskyGivenStable(stableAfter, cal.strike, cal.sigma, tau).parseUnits();
                deltaOut = reserve.reserveRisky - (riskyAfter * reserve.liquidity) / 1e18;
            }

            int128 invariantAfter = ReplicationMath.calcInvariant(riskyAfter, stableAfter, cal.strike, cal.sigma, tau);

            if (invariantAfter > int128(2**64)) {
                reserve.swap(swapInRisky, deltaInWithFee, deltaOut, _blockTimestamp());
                if (reserve.float > 0) reserve.addFee(swapInRisky ? fee : 0, swapInRisky ? 0 : fee);
            } else {
                reserve.swap(swapInRisky, details.deltaIn, deltaOut, _blockTimestamp());
            }

            invariantAfter = invariantOf(details.poolId);
            if (invariant > invariantAfter && invariant.sub(invariantAfter) >= int128(184467441000000000))
                revert InvariantError(invariant, invariantAfter);
        }

        if (deltaOut == 0) revert DeltaOutError();

        if (details.riskyForStable) {
            IERC20(stable).safeTransfer(msg.sender, deltaOut); // send proceeds, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(deltaIn, 0); // pay for swap
            } else {
                uint256 balRisky = balanceRisky();
                IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // agnostic payment
                if (balanceRisky() < balRisky + details.deltaIn)
                    revert RiskyBalanceError(balRisky + details.deltaIn, balanceRisky());
            }
        } else {
            IERC20(risky).safeTransfer(msg.sender, deltaOut); // send proceeds first, for callback if needed
            if (details.fromMargin) {
                margins.withdraw(0, deltaIn); // pay for swap
            } else {
                uint256 balStable = balanceStable();
                IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // agnostic payment
                if (balanceStable() < balStable + details.deltaIn)
                    revert StableBalanceError(balStable + details.deltaIn, balanceStable());
            }
        }

        emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, deltaOut);
    }

    // ===== Convexity =====

    /// @inheritdoc IPrimitiveEngineActions
    function supply(bytes32 poolId, uint256 delLiquidity) external override lock {
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
        uint256 riskyCollateral,
        uint256 stableCollateral,
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
        if (riskyCollateral == 0 && stableCollateral == 0) revert ZeroLiquidityError();
        if (_blockTimestamp() > calibrations[poolId].maturity) revert PoolExpiredError();

        positions.borrow(poolId, riskyCollateral, stableCollateral);

        {
            // liquidity scope
            Reserve.Data storage reserve = reserves[poolId];
            uint256 strike = uint256(calibrations[poolId].strike);
            uint256 delLiquidity = riskyCollateral + (stableCollateral * 1e18) / strike; // total debt incurred
            (uint256 delRisky, uint256 delStable) = reserve.getAmounts(delLiquidity); // amounts from removing

            if (riskyCollateral > delRisky) riskyDeficit = riskyCollateral - delRisky;
            else riskySurplus = delRisky - riskyCollateral;
            if (stableCollateral > delStable) stableDeficit = stableCollateral - delStable;
            else stableSurplus = delStable - stableCollateral;
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

            if (balanceRisky() < balRisky + riskyDeficit)
                revert RiskyBalanceError(balRisky + riskyDeficit, balanceRisky());
            if (balanceStable() < balStable + stableDeficit)
                revert StableBalanceError(balStable + stableDeficit, balanceStable());
        }

        emit Borrowed(
            msg.sender,
            poolId,
            riskyCollateral,
            stableCollateral,
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
        uint256 riskyCollateral,
        uint256 stableCollateral,
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
        {
            // position scope
            bytes32 id = poolId;
            bool expired = _blockTimestamp() >= cal.maturity + 86400;
            address account = expired ? recipient : msg.sender;
            positions.fetch(account, id).repay(riskyCollateral, stableCollateral); // increase: risky/stableCollateral
        }

        {
            // liquidity scope
            Reserve.Data storage reserve = reserves[poolId];
            uint256 delLiquidity = riskyCollateral + (stableCollateral * 1e18) / uint256(cal.strike); // Debt sum
            (uint256 delRisky, uint256 delStable) = reserve.getAmounts(delLiquidity); // amounts to allocate

            if (delRisky > riskyCollateral) riskyDeficit = delRisky - riskyCollateral;
            else riskySurplus = riskyCollateral - delRisky;
            if (delStable > stableCollateral) stableDeficit = delStable - stableCollateral;
            else stableSurplus = stableCollateral - delStable;

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

            if (balanceRisky() < balRisky + riskyDeficit)
                revert RiskyBalanceError(balRisky + riskyDeficit, balanceRisky());
            if (balanceStable() < balStable + stableDeficit)
                revert StableBalanceError(balStable + stableDeficit, balanceStable());
        }

        emit Repaid(
            msg.sender,
            recipient,
            poolId,
            riskyCollateral,
            stableCollateral,
            riskyDeficit,
            riskySurplus,
            stableDeficit,
            stableSurplus
        );
    }

    // ===== Swap and Liquidity Math =====

    /// @inheritdoc IPrimitiveEngineView
    function getStableGivenRisky(bytes32 poolId, uint256 reserveRisky)
        public
        view
        override
        returns (int128 reserveStable)
    {
        Calibration memory cal = calibrations[poolId];
        int128 invariantLast = invariantOf(poolId);
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() uses this
        reserveStable = invariantLast.getStableGivenRisky(reserveRisky, cal.strike, cal.sigma, tau);
    }

    /// @inheritdoc IPrimitiveEngineView
    function getRiskyGivenStable(bytes32 poolId, uint256 reserveStable)
        public
        view
        override
        returns (int128 reserveRisky)
    {
        Calibration memory cal = calibrations[poolId];
        int128 invariantLast = invariantOf(poolId);
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() uses this
        reserveRisky = invariantLast.getRiskyGivenStable(reserveStable, cal.strike, cal.sigma, tau);
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory reserve = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        uint256 tau = cal.maturity - cal.lastTimestamp;
        (uint256 reserveRisky, uint256 reserveStable) = reserve.getAmounts(1e18); // reserves per 1 liquidity
        invariant = ReplicationMath.calcInvariant(reserveRisky, reserveStable, cal.strike, cal.sigma, tau);
    }
}
