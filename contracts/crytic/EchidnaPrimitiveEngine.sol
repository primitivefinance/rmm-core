// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../libraries/Margin.sol";
import "../libraries/ReplicationMath.sol";
import "../libraries/Reserve.sol";
import "../libraries/SafeCast.sol";
import "../libraries/Transfers.sol";
import "../libraries/Units.sol";

import "../interfaces/callback/IPrimitiveCreateCallback.sol";
import "../interfaces/callback/IPrimitiveDepositCallback.sol";
import "../interfaces/callback/IPrimitiveLiquidityCallback.sol";
import "../interfaces/callback/IPrimitiveSwapCallback.sol";

import "../interfaces/IERC20.sol";
import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IPrimitiveFactory.sol";

/// @title   Primitive Engine
/// @author  Primitive
/// @notice  Replicating Market Maker
/// @dev     RMM-01
contract EchidnaPrimitiveEngine is IPrimitiveEngine {
    using ReplicationMath for int128;
    using Units for uint256;
    using SafeCast for uint256;
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Reserve for Reserve.Data;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Transfers for IERC20;

    /// @dev            Parameters of each pool
    /// @param strike   Strike price of pool with stable token decimals
    /// @param sigma    Implied volatility, with 1e4 decimals such that 10000 = 100%
    /// @param maturity Timestamp of pool expiration, in seconds
    /// @param lastTimestamp Timestamp of the pool's last update, in seconds
    /// @param gamma    Multiplied against deltaIn amounts to apply swap fee, gamma = 1 - fee %, scaled up by 1e4
    struct Calibration {
        uint128 strike;
        uint32 sigma;
        uint32 maturity;
        uint32 lastTimestamp;
        uint32 gamma;
    }

    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override PRECISION = 10**18;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public constant override BUFFER = 120 seconds;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override MIN_LIQUIDITY;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override scaleFactorRisky;
    /// @inheritdoc IPrimitiveEngineView
    uint256 public immutable override scaleFactorStable;
    /// @inheritdoc IPrimitiveEngineView
    address public override factory; // immutable in main engine
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override risky;
    /// @inheritdoc IPrimitiveEngineView
    address public immutable override stable;
    /// @dev Reentrancy guard initialized to state
    uint256 private locked = 1;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Calibration) public override calibrations;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => Margin.Data) public override margins;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Reserve.Data) public override reserves;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => mapping(bytes32 => uint256)) public override liquidity;

    modifier lock() {
        if (locked != 1) revert LockedError();

        locked = 2;
        _;
        locked = 1;
    }

    /// @notice Deploys an Engine with two tokens, a 'Risky' and 'Stable'
    constructor(address _risky, address _stable, uint256 _scaleFactorRisky, uint256 _scaleFactorStable, uint256 _min_liquidity) {
        risky = _risky;
        stable = _stable;
        scaleFactorRisky = _scaleFactorRisky;
        scaleFactorStable = _scaleFactorStable;
        MIN_LIQUIDITY = _min_liquidity;
    }

    /// @return Risky token balance of this contract
    function balanceRisky() private view returns (uint256) {
        (bool success, bytes memory data) = risky.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length != 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        (bool success, bytes memory data) = stable.staticcall(
            abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
        );
        if (!success || data.length != 32) revert BalanceError();
        return abi.decode(data, (uint256));
    }

    /// @notice Revert if expected amount does not exceed current balance
    function checkRiskyBalance(uint256 expectedRisky) private view {
        uint256 actualRisky = balanceRisky();
        if (actualRisky < expectedRisky) revert RiskyBalanceError(expectedRisky, actualRisky);
    }

    /// @notice Revert if expected amount does not exceed current balance
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
    function updateLastTimestamp(bytes32 poolId) external override lock returns (uint32 lastTimestamp) {
        lastTimestamp = _updateLastTimestamp(poolId);
    }

    /// @notice Sets the lastTimestamp of `poolId` to `block.timestamp`, max value is `maturity`
    /// @return lastTimestamp of the pool, used in calculating the time until expiry
    function _updateLastTimestamp(bytes32 poolId) internal virtual returns (uint32 lastTimestamp) {
        Calibration storage cal = calibrations[poolId];
        if (cal.lastTimestamp == 0) revert UninitializedError();

        lastTimestamp = _blockTimestamp();
        uint32 maturity = cal.maturity;
        if (lastTimestamp > maturity) lastTimestamp = maturity; // if expired, set to the maturity

        cal.lastTimestamp = lastTimestamp; // set state
        emit UpdateLastTimestamp(poolId);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function create(
        uint128 strike,
        uint32 sigma,
        uint32 maturity,
        uint32 gamma,
        uint256 riskyPerLp,
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
        (uint256 factor0, uint256 factor1) = (scaleFactorRisky, scaleFactorStable);
        poolId = keccak256(abi.encodePacked(address(this), strike, sigma, maturity, gamma));
        if (calibrations[poolId].lastTimestamp != 0) revert PoolDuplicateError();
        if (sigma > 1e7 || sigma < 1) revert SigmaError(sigma);
        if (strike == 0) revert StrikeError(strike);
        if (delLiquidity <= MIN_LIQUIDITY) revert MinLiquidityError(delLiquidity);
        if (riskyPerLp > PRECISION / factor0 || riskyPerLp == 0) revert RiskyPerLpError(riskyPerLp);
        if (gamma > Units.PERCENTAGE || gamma < 9000) revert GammaError(gamma);

        Calibration memory cal = Calibration({
            strike: strike,
            sigma: sigma,
            maturity: maturity,
            lastTimestamp: _blockTimestamp(),
            gamma: gamma
        });

        if (cal.lastTimestamp > cal.maturity) revert PoolExpiredError();
        uint32 tau = cal.maturity - cal.lastTimestamp; // time until expiry
        delStable = ReplicationMath.getStableGivenRisky(0, factor0, factor1, riskyPerLp, cal.strike, cal.sigma, tau);
        delRisky = (riskyPerLp * delLiquidity) / PRECISION; // riskyDecimals * 1e18 decimals / 1e18 = riskyDecimals
        delStable = (delStable * delLiquidity) / PRECISION;
        if (delRisky == 0 || delStable == 0) revert CalibrationError(delRisky, delStable);

        calibrations[poolId] = cal; // state update
        uint256 amount = delLiquidity - MIN_LIQUIDITY;
        liquidity[msg.sender][poolId] += amount; // burn min liquidity, at cost of msg.sender
        reserves[poolId].allocate(delRisky, delStable, delLiquidity, cal.lastTimestamp); // state update

        (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
        IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
        checkRiskyBalance(balRisky + delRisky);
        checkStableBalance(balStable + delStable);

        emit Create(msg.sender, cal.strike, cal.sigma, cal.maturity, cal.gamma, delRisky, delStable, amount);
    }

    // ===== Margin =====

    /// @inheritdoc IPrimitiveEngineActions
    function deposit(
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external override lock {
        if (delRisky == 0 && delStable == 0) revert ZeroDeltasError();
        margins[recipient].deposit(delRisky, delStable); // state update

        uint256 balRisky;
        uint256 balStable;
        if (delRisky != 0) balRisky = balanceRisky();
        if (delStable != 0) balStable = balanceStable();
        IPrimitiveDepositCallback(msg.sender).depositCallback(delRisky, delStable, data); // agnostic payment
        if (delRisky != 0) checkRiskyBalance(balRisky + delRisky);
        if (delStable != 0) checkStableBalance(balStable + delStable);
        emit Deposit(msg.sender, recipient, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function withdraw(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) external override lock {
        if (delRisky == 0 && delStable == 0) revert ZeroDeltasError();
        margins.withdraw(delRisky, delStable); // state update
        if (delRisky != 0) IERC20(risky).safeTransfer(recipient, delRisky);
        if (delStable != 0) IERC20(stable).safeTransfer(recipient, delStable);
        emit Withdraw(msg.sender, recipient, delRisky, delStable);
    }

    // ===== Liquidity =====

    /// @inheritdoc IPrimitiveEngineActions
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 delLiquidity) {
        if (delRisky == 0 || delStable == 0) revert ZeroDeltasError();
        Reserve.Data storage reserve = reserves[poolId];
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        uint32 timestamp = _blockTimestamp();

        uint256 liquidity0 = (delRisky * reserve.liquidity) / uint256(reserve.reserveRisky);
        uint256 liquidity1 = (delStable * reserve.liquidity) / uint256(reserve.reserveStable);
        delLiquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        if (delLiquidity == 0) revert ZeroLiquidityError();

        liquidity[recipient][poolId] += delLiquidity; // increase position liquidity
        reserve.allocate(delRisky, delStable, delLiquidity, timestamp); // increase reserves and liquidity

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            (uint256 balRisky, uint256 balStable) = (balanceRisky(), balanceStable());
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data); // agnostic payment
            checkRiskyBalance(balRisky + delRisky);
            checkStableBalance(balStable + delStable);
        }

        emit Allocate(msg.sender, recipient, poolId, delRisky, delStable, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(bytes32 poolId, uint256 delLiquidity)
        external
        override
        lock
        returns (uint256 delRisky, uint256 delStable)
    {
        if (delLiquidity == 0) revert ZeroLiquidityError();
        Reserve.Data storage reserve = reserves[poolId];
        if (reserve.blockTimestamp == 0) revert UninitializedError();
        (delRisky, delStable) = reserve.getAmounts(delLiquidity);

        liquidity[msg.sender][poolId] -= delLiquidity; // state update
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
        margins[msg.sender].deposit(delRisky, delStable);

        emit Remove(msg.sender, poolId, delRisky, delStable, delLiquidity);
    }

    struct SwapDetails {
        address recipient;
        bool riskyForStable;
        bool fromMargin;
        bool toMargin;
        uint32 timestamp;
        bytes32 poolId;
        uint256 deltaIn;
        uint256 deltaOut;
    }

    /// @inheritdoc IPrimitiveEngineActions
    function swap(
        address recipient,
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) external override lock {
        if (deltaIn == 0) revert DeltaInError();
        if (deltaOut == 0) revert DeltaOutError();

        SwapDetails memory details = SwapDetails({
            recipient: recipient,
            poolId: poolId,
            deltaIn: deltaIn,
            deltaOut: deltaOut,
            riskyForStable: riskyForStable,
            fromMargin: fromMargin,
            toMargin: toMargin,
            timestamp: _blockTimestamp()
        });

        uint32 lastTimestamp = _updateLastTimestamp(details.poolId); // updates lastTimestamp of `poolId`
        if (details.timestamp > lastTimestamp + BUFFER) revert PoolExpiredError(); // 120s buffer to allow final swaps
        int128 invariantX64 = invariantOf(details.poolId); // stored in memory to perform the invariant check

        {
            // swap scope, avoids stack too deep errors
            Calibration memory cal = calibrations[details.poolId];
            Reserve.Data storage reserve = reserves[details.poolId];
            uint32 tau = cal.maturity - cal.lastTimestamp;
            uint256 deltaInWithFee = (details.deltaIn * cal.gamma) / Units.PERCENTAGE; // amount * (1 - fee %)

            uint256 adjustedRisky;
            uint256 adjustedStable;
            if (details.riskyForStable) {
                adjustedRisky = uint256(reserve.reserveRisky) + deltaInWithFee;
                adjustedStable = uint256(reserve.reserveStable) - deltaOut;
            } else {
                adjustedRisky = uint256(reserve.reserveRisky) - deltaOut;
                adjustedStable = uint256(reserve.reserveStable) + deltaInWithFee;
            }
            adjustedRisky = (adjustedRisky * PRECISION) / reserve.liquidity;
            adjustedStable = (adjustedStable * PRECISION) / reserve.liquidity;

            int128 invariantAfter = ReplicationMath.calcInvariant(
                scaleFactorRisky,
                scaleFactorStable,
                adjustedRisky,
                adjustedStable,
                cal.strike,
                cal.sigma,
                tau
            );

            if (invariantX64 > invariantAfter) revert InvariantError(invariantX64, invariantAfter);
            reserve.swap(details.riskyForStable, details.deltaIn, details.deltaOut, details.timestamp); // state update
        }

        if (details.riskyForStable) {
            if (details.toMargin) {
                margins[details.recipient].deposit(0, details.deltaOut);
            } else {
                IERC20(stable).safeTransfer(details.recipient, details.deltaOut); // optimistic transfer out
            }

            if (details.fromMargin) {
                margins.withdraw(details.deltaIn, 0); // pay for swap
            } else {
                uint256 balRisky = balanceRisky();
                IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // agnostic transfer in
                checkRiskyBalance(balRisky + details.deltaIn);
            }
        } else {
            if (details.toMargin) {
                margins[details.recipient].deposit(details.deltaOut, 0);
            } else {
                IERC20(risky).safeTransfer(details.recipient, details.deltaOut); // optimistic transfer out
            }

            if (details.fromMargin) {
                margins.withdraw(0, details.deltaIn); // pay for swap
            } else {
                uint256 balStable = balanceStable();
                IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // agnostic transfer in
                checkStableBalance(balStable + details.deltaIn);
            }
        }

        emit Swap(
            msg.sender,
            details.recipient,
            details.poolId,
            details.riskyForStable,
            details.deltaIn,
            details.deltaOut
        );
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Calibration memory cal = calibrations[poolId];
        uint32 tau = cal.maturity - cal.lastTimestamp; // cal maturity can never be less than lastTimestamp
        (uint256 riskyPerLiquidity, uint256 stablePerLiquidity) = reserves[poolId].getAmounts(PRECISION); // 1e18 liquidity
        invariant = ReplicationMath.calcInvariant(
            scaleFactorRisky,
            scaleFactorStable,
            riskyPerLiquidity,
            stablePerLiquidity,
            cal.strike,
            cal.sigma,
            tau
        );
    }
}
