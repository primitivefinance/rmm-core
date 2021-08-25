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
        if (!success && data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        (bool success, bytes memory data) = stable.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success && data.length < 32) revert BalanceError();
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
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky tokens to provide
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable tokens to provide
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
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky tokens to remove
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable tokens to remove
        if (delRisky * delStable == 0) revert ZeroDeltasError();

        positions.remove(poolId, delLiquidity); // update position liquidity of msg.sender
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // update global reserves
        margins[msg.sender].deposit(delRisky, delStable); // increase margin balance of msg.sender
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
            timestamp: _blockTimestamp() // current block.timestamp, used in reserve cumulative reserve
        });

        // 0. Important: Update the lastTimestamp, effectively updating the time until expiry of the option
        uint32 lastTimestamp = _updateLastTimestamp(details.poolId); // the pool's actual timestamp, after being updated
        if (details.timestamp > lastTimestamp + 120) revert PoolExpiredError(); // 120s buffer to allow the final swaps to occur

        // 1. Calculate invariant using the new time until expiry, tau = maturity - lastTimestamp
        int128 invariant = invariantOf(details.poolId);
        Reserve.Data storage reserve = reserves[details.poolId];
        (uint256 resRisky, uint256 resStable) = (reserve.reserveRisky, reserve.reserveStable);

        // 2. Calculate swapOut token reserve using new invariant + new time until expiry + new swapIn reserve
        // 3. Calculate difference of old swapOut token reserve and new swapOut token reserve to get swapOut amount
        if (details.riskyForStable) {
            uint256 nextRisky = ((resRisky + ((details.deltaIn * 9985) / 1e4)) * 1e18) / reserve.liquidity;
            uint256 nextStable = ((getStableGivenRisky(details.poolId, nextRisky).parseUnits() * reserve.liquidity) /
                1e18);
            deltaOut = resStable - nextStable;
        } else {
            uint256 nextStable = ((resStable + ((details.deltaIn * 9985) / 1e4)) * 1e18) / reserve.liquidity;
            uint256 nextRisky = (getRiskyGivenStable(details.poolId, nextStable).parseUnits() * reserve.liquidity) /
                1e18;
            deltaOut = resRisky - nextRisky;
        }

        if (deltaOut == 0) revert DeltaOutError();

        {
            // avoids stack too deep errors
            uint256 amountOut = deltaOut;
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            if (details.riskyForStable) {
                IERC20(stable).safeTransfer(msg.sender, amountOut); // send proceeds, for callback if needed
                if (details.fromMargin) {
                    margins.withdraw(deltaIn, 0); // pay for swap
                } else {
                    IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // agnostic payment
                    if (balanceRisky() < balRisky + details.deltaIn)
                        revert RiskyBalanceError(balRisky + details.deltaIn, balanceRisky());
                }
                if (balanceStable() < balStable - amountOut)
                    revert StableBalanceError(balStable - amountOut, balanceStable());
            } else {
                IERC20(risky).safeTransfer(msg.sender, amountOut); // send proceeds first, for callback if needed
                if (details.fromMargin) {
                    margins.withdraw(0, deltaIn); // pay for swap
                } else {
                    IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // agnostic payment
                    if (balanceStable() < balStable + details.deltaIn)
                        revert StableBalanceError(balStable + details.deltaIn, balanceStable());
                }
                if (balanceRisky() < balRisky - amountOut)
                    revert RiskyBalanceError(balRisky - amountOut, balanceRisky());
            }

            reserve.swap(details.riskyForStable, details.deltaIn, amountOut, details.timestamp);
            int128 nextInvariant = invariantOf(details.poolId); // 4. Important: do invariant check
            if (invariant > nextInvariant && nextInvariant.sub(invariant) >= Units.MANTISSA_INT)
                revert InvariantError(invariant, nextInvariant);
            emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, amountOut);
        }
    }

    // ===== Convexity =====

    /// @inheritdoc IPrimitiveEngineActions
    function supply(bytes32 poolId, uint256 delLiquidity) external override lock {
        if (delLiquidity == 0) revert ZeroLiquidityError();
        positions.supply(poolId, delLiquidity); // increase position float by `delLiquidity`
        reserves[poolId].addFloat(delLiquidity); // increase global float
        emit Supplied(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function claim(bytes32 poolId, uint256 delLiquidity) external override lock {
        if (delLiquidity == 0) revert ZeroLiquidityError();
        positions.claim(poolId, delLiquidity); // reduce float by `delLiquidity`
        reserves[poolId].removeFloat(delLiquidity); // reduce global float
        emit Claimed(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function borrow(
        bytes32 poolId,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            uint256 delRisky,
            uint256 delStable,
            uint256 premium
        )
    {
        // Source: Convex Payoff Approximation. https://stanford.edu/~guillean/papers/cfmm-lending.pdf. Section 5.
        if (delLiquidity == 0) revert ZeroLiquidityError();

        Reserve.Data storage reserve = reserves[poolId];
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky from removing
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable from removing
        // 0. Update position of `msg.sender` by increasing `delLiquidity` units of debt
        positions.borrow(poolId, delLiquidity);
        // 1. Borrow `delLiquidity`: Reduce global reserve float, increase global debt
        reserve.borrowFloat(delLiquidity);
        // 2. Remove liquidity: Releases `risky` and `stable` tokens from curve
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
        // 3. Calculate amount of risky tokens needed to match amount of liquidity borrowed
        premium = delLiquidity - delRisky; // premium that must be paid
        // 4. Pay the premium
        if (fromMargin) {
            margins.withdraw(premium, 0); // pay premium from margin risky balance
            margins[msg.sender].deposit(0, delStable); // deposit stable tokens from removed liquidity
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IERC20(stable).safeTransfer(msg.sender, delStable); // transfer stable tokens to use in callback
            IPrimitiveBorrowCallback(msg.sender).borrowCallback(delLiquidity, delRisky, delStable, data); // agnostic

            if (balanceRisky() < balRisky + premium) revert RiskyBalanceError(balRisky + premium, balanceRisky());
            if (balanceStable() < balStable - delStable)
                revert StableBalanceError(balStable - delStable, balanceStable());
        }

        emit Borrowed(msg.sender, poolId, delLiquidity, premium);
    }

    /// @inheritdoc IPrimitiveEngineActions
    /// @dev    Reverts early if `delLiquidity` > debt, or debt is 0
    ///         Important: If the pool is expired, any position can be repaid
    function repay(
        bytes32 poolId,
        address recipient,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    )
        external
        override
        lock
        returns (
            uint256 delRisky,
            uint256 delStable,
            uint256 premium
        )
    {
        uint32 timestamp = _blockTimestamp();
        bool expired = timestamp >= calibrations[poolId].maturity;
        address account = expired ? recipient : msg.sender; // allows repayment of any position after expiry
        positions.fetch(account, poolId).repay(delLiquidity); // decrease debt of Position

        Reserve.Data storage reserve = reserves[poolId];
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky required to allocate
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable required to allocate
        premium = delLiquidity - delRisky; // amount of excess risky, used to pay for stable side

        if (fromMargin) {
            margins.withdraw(0, delStable); // pay stables from margin balance
            margins[account].deposit(premium, 0); // send remainder `premium` of risky to margin
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IERC20(risky).safeTransfer(msg.sender, premium); // proceeds transferred out optimistically
            IPrimitiveRepayCallback(msg.sender).repayCallback(delStable, data); // agnostic payment of delStable

            if (balanceRisky() < balRisky - premium) revert RiskyBalanceError(balRisky - premium, balanceRisky());
            if (balanceStable() < balStable + delStable)
                revert StableBalanceError(balStable + delStable, balanceStable());
        }

        reserve.allocate(delRisky, delStable, delLiquidity, timestamp); // increase: risky, stable, and liquidity
        reserve.repayFloat(delLiquidity); // increase reserve float, decrease reserve debt
        emit Repaid(msg.sender, recipient, poolId, delLiquidity, premium);
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
        uint256 tau;
        if (cal.maturity > cal.lastTimestamp) tau = cal.maturity - cal.lastTimestamp; // invariantOf() uses this
        reserveStable = ReplicationMath.getStableGivenRisky(invariantLast, reserveRisky, cal.strike, cal.sigma, tau);
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
        uint256 tau;
        if (cal.maturity > cal.lastTimestamp) tau = cal.maturity - cal.lastTimestamp; // invariantOf() uses this
        reserveRisky = ReplicationMath.getRiskyGivenStable(invariantLast, reserveStable, cal.strike, cal.sigma, tau);
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        uint256 reserveRisky = (res.reserveRisky * 1e18) / res.liquidity; // risky per 1 liquidity
        uint256 reserveStable = (res.reserveStable * 1e18) / res.liquidity; // stable per 1 liquidity
        uint256 tau;
        if (cal.maturity > cal.lastTimestamp) tau = cal.maturity - cal.lastTimestamp;
        invariant = ReplicationMath.calcInvariant(reserveRisky, reserveStable, cal.strike, cal.sigma, tau);
    }
}
