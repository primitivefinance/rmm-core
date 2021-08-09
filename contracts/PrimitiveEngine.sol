// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Primitive Engine
/// @author  Primitive
/// @dev     Two-token CFMM with a Black-scholes trading function and virtual curves

import "./libraries/ABDKMath64x64.sol";
import "./libraries/BlackScholes.sol";
import "./libraries/Margin.sol";
import "./libraries/Position.sol";
import "./libraries/ReplicationMath.sol";
import "./libraries/Reserve.sol";
import "./libraries/SafeCast.sol";
import "./libraries/Transfers.sol";
import "./libraries/Units.sol";

import "./interfaces/callback/IPrimitiveCreateCallback.sol";
import "./interfaces/callback/IPrimitiveLendingCallback.sol";
import "./interfaces/callback/IPrimitiveLiquidityCallback.sol";
import "./interfaces/callback/IPrimitiveMarginCallback.sol";
import "./interfaces/callback/IPrimitiveSwapCallback.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPrimitiveEngine.sol";
import "./interfaces/IPrimitiveFactory.sol";

contract PrimitiveEngine is IPrimitiveEngine {
    using ABDKMath64x64 for *;
    using BlackScholes for int128;
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
        if (success && data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        (bool success, bytes memory data) = stable.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (success && data.length < 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return blockTimestamp casted as a uint32
    function _blockTimestamp() internal view virtual returns (uint32 blockTimestamp) {
        // solhint-disable-next-line
        blockTimestamp = uint32(block.timestamp);
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
        delRisky = 1e18 - delta; // Note: delta is defined between 0-1 for call options
        delStable = ReplicationMath.getStableGivenRisky(0, delRisky, cal.strike, cal.sigma, tau).parseUnits();
        delRisky = (delRisky * delLiquidity) / 1e18;
        delStable = (delStable * delLiquidity) / 1e18;
        if ((delRisky * delStable) == 0) revert CalibrationError(delRisky, delStable);

        (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
        IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
        if (balanceRisky() < delRisky + balRisky) revert RiskyBalanceError(delRisky + balRisky, balanceRisky());
        if (balanceStable() < delStable + balStable) revert StableBalanceError(delStable + balStable, balanceStable());

        calibrations[poolId] = cal; // initialize calibration
        reserves[poolId].allocate(delRisky, delStable, delLiquidity, timestamp); // mint liquidity
        positions.fetch(msg.sender, poolId).allocate(delLiquidity - 1000); // give liquidity to `msg.sender`, burn 1000 wei
        emit Created(msg.sender, cal.strike, cal.sigma, cal.maturity);
    }

    // ===== Margin =====

    /// @inheritdoc IPrimitiveEngineActions
    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external override lock {
        (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
        IPrimitiveMarginCallback(msg.sender).depositCallback(delRisky, delStable, data); // receive tokens
        (uint256 nextRisky, uint256 nextStable) = (balanceRisky(), balanceStable());
        if (nextRisky < balRisky + delRisky) revert RiskyBalanceError(balRisky + delRisky, nextRisky);
        if (nextStable < balStable + delStable) revert StableBalanceError(balStable + delStable, nextStable);

        margins[owner].deposit(delRisky, delStable); // adds to risky and/or stable token balances
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
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        Reserve.Data storage reserve = reserves[poolId];
        (uint256 resLiquidity, uint256 resRisky, uint256 resStable) = (
            reserve.liquidity,
            reserve.reserveRisky,
            reserve.reserveStable
        );

        if (reserve.blockTimestamp == 0) revert UninitializedError();
        delRisky = (delLiquidity * resRisky) / resLiquidity; // amount of risky tokens to provide
        delStable = (delLiquidity * resStable) / resLiquidity; // amount of stable tokens to provide
        if (delRisky * delStable == 0) revert ZeroDeltasError();

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data); // agnostic payment
            (uint256 nextRisky, uint256 nextStable) = (balanceRisky(), balanceStable());
            if (nextRisky < balRisky + delRisky) revert RiskyBalanceError(balRisky + delRisky, nextRisky);
            if (nextStable < balStable + delStable) revert StableBalanceError(balStable + delStable, nextStable);
        }

        Position.Data storage position = positions.fetch(owner, poolId);
        position.allocate(delLiquidity); // increase position liquidity
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp()); // increase reserves and liquidity
        emit Allocated(msg.sender, poolId, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bool toMargin,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        Reserve.Data storage reserve = reserves[poolId];
        (uint256 resRisky, uint256 resStable, uint256 resLiquidity) = (
            reserve.reserveRisky,
            reserve.reserveStable,
            reserve.liquidity
        );

        delRisky = (resRisky * delLiquidity) / resLiquidity; // amount of risky to remove
        delStable = (resStable * delLiquidity) / resLiquidity; // amount of stable to remove
        if (delRisky * delStable == 0) revert ZeroDeltasError();

        positions.remove(poolId, delLiquidity); // update position liquidity, notice the fn call on the mapping
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // update global reserves

        if (toMargin) {
            Margin.Data storage margin = margins[msg.sender];
            margin.deposit(delRisky, delStable); // increase margin balance
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IERC20(risky).safeTransfer(msg.sender, delRisky);
            IERC20(stable).safeTransfer(msg.sender, delStable);
            IPrimitiveLiquidityCallback(msg.sender).removeCallback(delRisky, delStable, data); // agnostic withdrawals
            (uint256 nextRisky, uint256 nextStable) = (balanceRisky(), balanceStable());
            if (nextRisky < balRisky - delRisky) revert RiskyBalanceError(balRisky - delRisky, nextRisky);
            if (nextStable < balStable - delStable) revert StableBalanceError(balStable - delStable, nextStable);
        }
        emit Removed(msg.sender, poolId, delRisky, delStable);
    }

    struct SwapDetails {
        bytes32 poolId;
        uint256 deltaIn;
        bool riskyForStable;
        bool fromMargin;
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
            fromMargin: fromMargin
        });

        // 1. Update the lastTimestamp, effectively updating the time until expiry
        uint32 timestamp = _blockTimestamp();
        calibrations[details.poolId].lastTimestamp = timestamp;
        emit UpdatedTimestamp(details.poolId, timestamp);
        // 2. Calculate invariant using the new time until expiry, tau = maturity - lastTimestamp
        int128 invariant = invariantOf(details.poolId);
        Reserve.Data storage reserve = reserves[details.poolId]; // gas savings
        (uint256 resRisky, uint256 resStable) = (reserve.reserveRisky, reserve.reserveStable);

        // 3. Calculate swapOut token reserve using new invariant + new time until expiry + new swapIn reserve
        // 4. Calculate difference of old swapOut token reserve and new swapOut token reserve to get swap out amount
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
                    margins.withdraw(deltaIn, uint256(0)); // pay for swap
                } else {
                    IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // invoice
                    uint256 nextRisky = balanceRisky();
                    if (balRisky + details.deltaIn > nextRisky)
                        revert RiskyBalanceError(balRisky + details.deltaIn, nextRisky);
                }
                uint256 nextStable = balanceStable();
                if (balStable - amountOut > nextStable) revert StableBalanceError(balStable - amountOut, nextStable);
            } else {
                IERC20(risky).safeTransfer(msg.sender, amountOut); // send proceeds first, for callback if needed
                if (details.fromMargin) {
                    margins.withdraw(uint256(0), deltaIn); // pay for swap
                } else {
                    IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // invoice
                    uint256 nextStable = balanceStable();
                    if (balStable + details.deltaIn > nextStable)
                        revert StableBalanceError(balStable + details.deltaIn, nextStable);
                }
                uint256 nextRisky = balanceRisky();
                if (balRisky - amountOut > nextRisky) revert RiskyBalanceError(balRisky - amountOut, nextRisky);
            }

            reserve.swap(details.riskyForStable, details.deltaIn, amountOut, _blockTimestamp());
            int128 nextInvariant = invariantOf(details.poolId);
            if (invariant > nextInvariant && nextInvariant.sub(invariant) >= Units.MANTISSA_INT)
                revert InvariantError(invariant, nextInvariant);
            emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, amountOut);
        }
    }

    // ===== Lending =====

    /// @inheritdoc IPrimitiveEngineActions
    function lend(bytes32 poolId, uint256 delLiquidity) external override lock {
        if (delLiquidity == 0) revert ZeroLiquidityError();
        positions.lend(poolId, delLiquidity); // increase position float by `delLiquidity`
        reserves[poolId].addFloat(delLiquidity); // increase global float
        emit Loaned(msg.sender, poolId, delLiquidity);
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
    ) external override lock returns (uint256 premium) {
        // Source: Convex Payoff Approximation. https://stanford.edu/~guillean/papers/cfmm-lending.pdf. Section 5
        if (delLiquidity == 0) revert ZeroLiquidityError();

        // fail early if not enough float to borrow
        Reserve.Data storage reserve = reserves[poolId];

        uint256 resLiquidity = reserve.liquidity; // global liquidity balance
        uint256 delRisky = (delLiquidity * reserve.reserveRisky) / resLiquidity; // amount of risky asset
        uint256 delStable = (delLiquidity * reserve.reserveStable) / resLiquidity; // amount of stable asset

        {
            // 0. Update position of `msg.sender` with `delLiquidity` units of debt and `risky` tokens
            positions.borrow(poolId, delLiquidity);
            // 1. Borrow `delLiquidity`: Reduce global reserve float, increase global debt
            reserve.borrowFloat(delLiquidity);
            // 2. Remove liquidity: Releases `risky` and `stable` tokens
            reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
            // 3. Calculate amount of risky tokens needed to match amount of liquidity borrowed
            premium = delLiquidity - delRisky; // premium that must be paid

            // Balances before position creation
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IERC20(stable).safeTransfer(msg.sender, delStable); // transfer the stable tokens of the liquidity out to the `msg.sender`

            if (fromMargin) {
                margins.withdraw(premium, 0); // pay premium from margin risky balance
            } else {
                // 4. Sell `stable` tokens for `risky` tokens, agnostically, within the callback
                IPrimitiveLendingCallback(msg.sender).borrowCallback(delLiquidity, delRisky, delStable, data);
                // Check balances after position creation
                uint256 postRisky = balanceRisky();
                if (balRisky + premium > postRisky) revert RiskyBalanceError(balRisky + premium, postRisky);
            }

            uint256 postStable = balanceStable();
            if (balStable - delStable > postStable) revert StableBalanceError(balStable - delStable, postStable);
        }

        emit Borrowed(msg.sender, poolId, delLiquidity, premium);
    }

    /// @inheritdoc IPrimitiveEngineActions
    /// @dev    Reverts if pos.debt is 0, or delLiquidity >= pos.liquidity (not enough of a balance to pay debt)
    function repay(
        bytes32 poolId,
        address owner,
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
        Reserve.Data storage reserve = reserves[poolId];

        // There is `delLiquidity` units of debt, which must be repaid using `delLiquidity` risky tokens.
        positions.fetch(owner, poolId).repay(delLiquidity); // must have an open position, releases position.debt of risky
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky required to mint LP
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable required to mint LP

        // fail early if 0 amounts
        if (delRisky * delStable == 0) revert ZeroDeltasError();

        premium = delLiquidity - delRisky; // amount of excess risky, used to pay for stable side

        // Update state
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp());
        reserve.repayFloat(delLiquidity);
        // Balances prior to callback/transfers
        uint256 balStable = balanceStable();
        if (fromMargin) {
            margins.withdraw(0, delStable); // pay stables from margin balance
            margins[owner].deposit(premium, 0); // receive remainder `premium` of risky to margin
        } else {
            IERC20(risky).safeTransfer(msg.sender, premium); // This is a concerning line of code!
            IPrimitiveLendingCallback(msg.sender).repayFromExternalCallback(delStable, data);

            // fails if stable is not paid
            uint256 nextStable = balanceStable();
            if (nextStable < balStable + delStable) revert StableBalanceError(balStable + delStable, nextStable);
        }

        emit Repaid(msg.sender, owner, poolId, delLiquidity, premium);
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
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() will use this same tau
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
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() will use this same tau
        reserveRisky = ReplicationMath.getRiskyGivenStable(invariantLast, reserveStable, cal.strike, cal.sigma, tau);
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        uint256 reserveRisky = (res.reserveRisky * 1e18) / res.liquidity;
        uint256 reserveStable = (res.reserveStable * 1e18) / res.liquidity;
        invariant = ReplicationMath.calcInvariant(
            reserveRisky,
            reserveStable,
            cal.strike,
            cal.sigma,
            (cal.maturity - cal.lastTimestamp) // maturity timestamp less last lastTimestamp = time until expiry
        );
    }
}
