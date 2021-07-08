// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

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
    using SafeCast for *;
    using Reserve for mapping(bytes32 => Reserve.Data);
    using Reserve for Reserve.Data;
    using Margin for mapping(address => Margin.Data);
    using Margin for Margin.Data;
    using Position for mapping(bytes32 => Position.Data);
    using Position for Position.Data;
    using Transfers for IERC20;

    /// @dev Parameters of each pool, writes all at the same maturity to maximize gas efficiency
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
    mapping(bytes32 => Calibration) public override settings;
    /// @inheritdoc IPrimitiveEngineView
    mapping(address => Margin.Data) public override margins;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Position.Data) public override positions;
    /// @inheritdoc IPrimitiveEngineView
    mapping(bytes32 => Reserve.Data) public override reserves;

    uint8 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, "Locked");
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
        return IERC20(risky).balanceOf(address(this));
    }

    /// @return Stable token balance of this contract
    function balanceStable() private view returns (uint256) {
        return IERC20(stable).balanceOf(address(this));
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
        uint256 riskyPrice,
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
        require((maturity * sigma * strike * delLiquidity) > 0, "Zero");
        poolId = getPoolId(strike, sigma, maturity);
        require(settings[poolId].lastTimestamp == 0, "Initialized");

        uint32 timestamp = _blockTimestamp();

        {
            (uint256 strikePrice, uint256 vol, uint32 maturity) = (strike, sigma, maturity);
            uint32 tau = maturity - timestamp;
            int128 callDelta = BlackScholes.deltaCall(riskyPrice, strikePrice, vol, tau);
            uint256 resRisky = uint256(1).fromUInt().sub(callDelta).parseUnits(); // risky = 1 - delta
            uint256 resStable = ReplicationMath
            .getTradingFunction(0, resRisky, 1e18, strikePrice, vol, tau)
            .parseUnits();
            delRisky = (resRisky * delLiquidity) / 1e18;
            delStable = (resStable * delLiquidity) / 1e18;
        }
        {
            uint256 balRisky = balanceRisky();
            uint256 balStable = balanceStable();
            IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
            require(balanceRisky() >= delRisky + balRisky, "Risky");
            require(balanceStable() >= delStable + balStable, "Stable");
        }

        Reserve.Data storage reserve = reserves[poolId];
        reserve.allocate(delRisky, delStable, delLiquidity, timestamp);
        positions.fetch(msg.sender, poolId).allocate(delLiquidity - 1000); // give liquidity to `msg.sender`, burn 1000 wei
        settings[poolId] = Calibration({
            strike: strike.toUint128(),
            sigma: sigma,
            maturity: maturity,
            lastTimestamp: timestamp
        });
        emit Created(msg.sender, strike, sigma, maturity);
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

        require(resLiquidity > 0, "Not initialized");
        delRisky = (resRisky * delLiquidity) / resLiquidity; // amount of risky tokens to provide
        delStable = (resStable * delLiquidity) / resLiquidity; // amount of stable tokens to provide
        require(delRisky * delStable > 0, "Deltas are 0");

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account
        } else {
            uint256 balRisky = balanceRisky();
            uint256 balStable = balanceStable();
            IPrimitiveLiquidityCallback(msg.sender).allocateCallback(delRisky, delStable, data); // agnostic payment
            require(balanceRisky() >= balRisky + delRisky, "Not enough risky");
            require(balanceStable() >= balStable + delStable, "Not enough stable");
        }

        Position.Data storage position = positions.fetch(owner, poolId);
        position.allocate(delLiquidity); // increase position liquidity
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp()); // increase reserves and liquidity
        emit Allocated(msg.sender, delRisky, delStable);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bool toMargin,
        bytes calldata data
    ) external override lock returns (uint256 delRisky, uint256 delStable) {
        require(delLiquidity > 0, "Cannot be 0"); // fail early

        Reserve.Data storage reserve = reserves[poolId];
        (uint256 resRisky, uint256 resStable, uint256 resLiquidity) = (
            reserve.reserveRisky,
            reserve.reserveStable,
            reserve.liquidity
        );

        require(resLiquidity >= delLiquidity, "Above max burn");
        delRisky = (resRisky * delLiquidity) / resLiquidity; // amount of risky to remove
        delStable = (resStable * delLiquidity) / resLiquidity; // amount of stable to remove
        require(delRisky * delStable > 0, "Deltas are 0");

        positions.remove(poolId, delLiquidity); // update position liquidity, notice the fn call on the mapping
        reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp()); // update global reserves

        if (toMargin) {
            Margin.Data storage margin = margins[msg.sender];
            margin.deposit(delRisky, delStable); // increase margin balance
        } else {
            uint256 balRisky = balanceRisky();
            uint256 balStable = balanceStable();
            IERC20(risky).safeTransfer(msg.sender, delRisky);
            IERC20(stable).safeTransfer(msg.sender, delStable);
            IPrimitiveLiquidityCallback(msg.sender).removeCallback(delRisky, delStable, data); // agnostic withdrawals
            require(balanceRisky() >= balRisky - delRisky, "Not enough risky");
            require(balanceStable() >= balStable - delStable, "Not enough stable");
        }
        emit Removed(msg.sender, delRisky, delStable);
    }

    struct SwapDetails {
        bytes32 poolId;
        uint256 deltaIn;
        uint256 deltaOutMin;
        bool riskyForStable;
        bool fromMargin;
    }

    /// @inheritdoc IPrimitiveEngineActions
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOutMin,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 deltaOut) {
        require(deltaIn > 0, "Zero");
        SwapDetails memory details = SwapDetails({
            poolId: poolId,
            deltaIn: deltaIn,
            deltaOutMin: deltaOutMin,
            riskyForStable: riskyForStable,
            fromMargin: fromMargin
        });

        // 1. Update the lastTimestamp, which is will be used whenever time until expiry is calculated
        settings[details.poolId].lastTimestamp = _blockTimestamp();
        // 2. Calculate invariant using the new time until expiry, tau = maturity - lastTimestamp
        int128 invariant = invariantOf(details.poolId);
        Reserve.Data storage reserve = reserves[details.poolId]; // gas savings
        (uint256 resRisky, uint256 resStable) = (reserve.reserveRisky, reserve.reserveStable);

        // 3. Calculate swapOut token reserve using new invariant + new time until expiry + new swapIn reserve
        // 4. Calculate difference of old swapOut token reserve and new swapOut token reserve to get swap out amount
        if (details.riskyForStable) {
            uint256 nextStable = getStableGivenRisky(poolId, resRisky + ((deltaIn * 9985) / 1e4)).parseUnits();
            deltaOut = resStable - nextStable;
        } else {
            uint256 nextRisky = getRiskyGivenStable(poolId, resStable + ((deltaIn * 9985) / 1e4)).parseUnits();
            deltaOut = resRisky - nextRisky;
        }
        require(deltaOut >= details.deltaOutMin, "Insufficient"); // price impact check

        {
            // avoids stack too deep errors
            uint256 amountOut = deltaOut;
            if (details.fromMargin) {
                if (details.riskyForStable) {
                    margins.withdraw(deltaIn, uint256(0)); // pay for swap
                    uint256 balStable = balanceStable();
                    IERC20(stable).safeTransfer(msg.sender, amountOut); // send proceeds
                    require(balanceStable() >= balStable - amountOut, "Sent too much tokens");
                } else {
                    margins.withdraw(uint256(0), deltaIn); // pay for swap
                    uint256 balRisky = balanceRisky();
                    IERC20(risky).safeTransfer(msg.sender, amountOut); // send proceeds
                    require(balanceRisky() >= balRisky - amountOut, "Sent too much tokens");
                }
            } else {
                if (details.riskyForStable) {
                    uint256 balRisky = balanceRisky();
                    IPrimitiveSwapCallback(msg.sender).swapCallback(details.deltaIn, 0, data); // invoice
                    require(balanceRisky() >= balRisky + details.deltaIn, "Not enough risky");

                    uint256 balStable = balanceStable();
                    IERC20(stable).safeTransfer(msg.sender, amountOut); // send proceeds
                    require(balanceStable() >= balStable - amountOut, "Sent too much tokens");
                } else {
                    uint256 balStable = balanceStable();
                    IPrimitiveSwapCallback(msg.sender).swapCallback(0, details.deltaIn, data); // invoice
                    require(balanceStable() >= balStable + details.deltaIn, "Not enough risky");

                    uint256 balRisky = balanceRisky();
                    IERC20(risky).safeTransfer(msg.sender, amountOut); // send proceeds
                    require(balanceRisky() >= balRisky - amountOut, "Sent too much tokens");
                }
            }

            reserve.swap(details.riskyForStable, details.deltaIn, amountOut, _blockTimestamp());
            require(invariantOf(details.poolId) >= invariant, "Invariant"); // FIX: invariant must be constant or growing
            emit Swap(msg.sender, details.poolId, details.riskyForStable, details.deltaIn, amountOut);
        }
    }

    // ===== Lending =====

    /// @inheritdoc IPrimitiveEngineActions
    function lend(bytes32 poolId, uint256 delLiquidity) external override lock {
        require(delLiquidity > 0, "Cannot be zero");
        positions.lend(poolId, delLiquidity); // increase position float by `delLiquidity`

        Reserve.Data storage reserve = reserves[poolId];
        reserve.addFloat(delLiquidity); // increase global float
        emit Loaned(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function claim(bytes32 poolId, uint256 delLiquidity) external override lock {
        require(delLiquidity > 0, "Cannot be zero");
        positions.claim(poolId, delLiquidity); // reduce float by `delLiquidity`

        Reserve.Data storage reserve = reserves[poolId];
        reserve.removeFloat(delLiquidity); // reduce global float
        emit Claimed(msg.sender, poolId, delLiquidity);
    }

    /// @inheritdoc IPrimitiveEngineActions
    function borrow(
        bytes32 poolId,
        uint256 delLiquidity,
        uint256 maxPremium,
        bytes calldata data
    ) external override lock returns (uint256 premium) {
        // Source: Convex Payoff Approimation. https://stanford.edu/~guillean/papers/cfmm-lending.pdf. Section 5
        Reserve.Data storage reserve = reserves[poolId];
        require(reserve.float >= delLiquidity && delLiquidity > 0, "Insufficient float"); // fail early if not enough float to borrow

        uint256 resLiquidity = reserve.liquidity; // global liquidity balance
        uint256 delRisky = (delLiquidity * reserve.reserveRisky) / resLiquidity; // amount of risky asset
        uint256 delStable = (delLiquidity * reserve.reserveStable) / resLiquidity; // amount of stable asset

        {
            // Balances before position creation
            uint256 preRisky = IERC20(risky).balanceOf(address(this));
            uint256 preStable = IERC20(stable).balanceOf(address(this));
            // 0. Update position of `msg.sender` with `delLiquidity` units of debt and `risky` tokens
            positions.borrow(poolId, delLiquidity);
            // 1. Borrow `delLiquidity`: Reduce global reserve float, increase global debt
            reserve.borrowFloat(delLiquidity);
            // 2. Remove liquidity: Releases `risky` and `stable` tokens
            reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
            // 3. Sell `stable` tokens for `risky` tokens, agnostically, within the callback
            IERC20(stable).safeTransfer(msg.sender, delStable); // transfer the stable tokens of the liquidity out to the `msg.sender`
            IPrimitiveLendingCallback(msg.sender).borrowCallback(delLiquidity, delRisky, delStable, data);
            // Check price impact tolerance
            premium = delLiquidity - delRisky;
            require(maxPremium >= premium, "Max");
            // Check balances after position creation
            uint256 postRisky = IERC20(risky).balanceOf(address(this));
            uint256 postStable = IERC20(stable).balanceOf(address(this));
            require(postRisky >= preRisky + premium, "IRY");
            require(postStable >= preStable - delStable, "IRL");
        }

        emit Borrowed(msg.sender, poolId, delLiquidity, maxPremium);
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
        Position.Data storage position = positions.fetch(owner, poolId);
        Margin.Data storage margin = margins[owner];

        // There is `delLiquidity` units of debt, which must be repaid using `delLiquidity` risky tokens.
        position.repay(delLiquidity); // must have an open position, releases position.debt of risky
        delRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity; // amount of risky required to mint LP
        delStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity; // amount of stable required to mint LP
        require(delRisky * delStable > 0, "Deltas are 0"); // fail early if 0 amounts

        premium = delLiquidity - delRisky; // amount of excess risky, used to pay for stable side

        // Update state
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp());
        reserve.repayFloat(delLiquidity);
        // Balances prior to callback/transfers
        uint256 preRisky = IERC20(risky).balanceOf(address(this));
        uint256 preStable = IERC20(stable).balanceOf(address(this));
        if (fromMargin) {
            margins.withdraw(0, delStable); // pay stables from margin balance
            margin.deposit(premium, 0); // receive remainder `premium` of risky to margin
        } else {
            IERC20(risky).safeTransfer(msg.sender, premium); // This is a concerning line of code!
            IPrimitiveLendingCallback(msg.sender).repayFromExternalCallback(delStable, data);
            require(IERC20(stable).balanceOf(address(this)) >= preStable + delStable, "IS"); // fails if stable is not paid
        }

        emit Repaid(owner, poolId, delLiquidity);
    }

    // ===== Swap and Liquidity Math =====

    /// @inheritdoc IPrimitiveEngineView
    function getStableGivenRisky(bytes32 poolId, uint256 reserveRisky)
        public
        view
        override
        returns (int128 reserveStable)
    {
        Calibration memory cal = settings[poolId];
        Reserve.Data memory res = reserves[poolId];
        int128 invariantLast = invariantOf(poolId);
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() will use this same tau
        reserveStable = ReplicationMath.getTradingFunction(
            invariantLast,
            reserveRisky,
            res.liquidity,
            cal.strike,
            cal.sigma,
            tau
        );
    }

    /// @inheritdoc IPrimitiveEngineView
    function getRiskyGivenStable(bytes32 poolId, uint256 reserveStable)
        public
        view
        override
        returns (int128 reserveRisky)
    {
        Calibration memory cal = settings[poolId];
        Reserve.Data memory res = reserves[poolId];
        int128 invariantLast = invariantOf(poolId);
        uint256 tau = cal.maturity - cal.lastTimestamp; // invariantOf() will use this same tau
        reserveRisky = ReplicationMath.getInverseTradingFunction(
            invariantLast,
            reserveStable,
            res.liquidity,
            cal.strike,
            cal.sigma,
            tau
        );
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[poolId];
        Calibration memory cal = settings[poolId];
        invariant = ReplicationMath.calcInvariant(
            res.reserveRisky,
            res.reserveStable,
            res.liquidity,
            cal.strike,
            cal.sigma,
            (cal.maturity - cal.lastTimestamp) // maturity timestamp less last lastTimestamp = maturity until expiry
        );
    }

    /// @inheritdoc IPrimitiveEngineView
    function getPoolId(
        uint256 strike,
        uint64 sigma,
        uint32 maturity
    ) public view override returns (bytes32 poolId) {
        poolId = keccak256(abi.encodePacked(factory, maturity, sigma, strike));
    }

    // ===== Flashes =====

    /// @inheritdoc IERC3156FlashLender
    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external override returns (bool) {
        uint256 fee = flashFee(token, amount); // reverts if unsupported token
        uint256 balanceBefore = token == stable ? balanceStable() : balanceRisky();
        IERC20(token).safeTransfer(address(receiver), amount);

        require(
            receiver.onFlashLoan(msg.sender, token, amount, fee, data) == keccak256("ERC3156FlashBorrower.onFlashLoan"),
            "IERC3156: Callback failed"
        );

        uint256 balanceAfter = token == stable ? balanceStable() : balanceRisky();
        require(balanceAfter >= balanceBefore + fee, "Not enough returned");
        uint256 payment = balanceAfter - balanceBefore;

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
