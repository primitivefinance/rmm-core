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

    /// @dev Parameters of each pool
    struct Calibration {
        uint128 strike; // strike price of the option
        uint64 sigma; // volatility of the option
        uint32 time; // time in seconds until the option expires
        uint32 blockTimestamp; // time stamp of initialization
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
        uint64 sigma,
        uint32 time,
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
        require((time * sigma * strike * delLiquidity) > 0, "Zero");
        poolId = getPoolId(strike, sigma, time);
        require(settings[poolId].time == 0, "Initialized");

        {
            // avoids stack too deep errors
            (uint256 strikePrice, uint256 vol, uint32 maturity) = (strike, sigma, time);
            uint32 timeDelta = maturity - _blockTimestamp();
            int128 callDelta = BlackScholes.deltaCall(riskyPrice, strikePrice, vol, timeDelta);
            uint256 resRisky = uint256(1).fromUInt().sub(callDelta).parseUnits(); // risky = 1 - delta
            uint256 resStable =
                ReplicationMath.getTradingFunction(resRisky, 1e18, strikePrice, vol, timeDelta).parseUnits();
            delRisky = (resRisky * delLiquidity) / 1e18;
            delStable = (resStable * delLiquidity) / 1e18;
        }

        uint256 balRisky = balanceRisky();
        uint256 balStable = balanceStable();
        IPrimitiveCreateCallback(msg.sender).createCallback(delRisky, delStable, data);
        require(balanceRisky() >= delRisky + balRisky, "Risky");
        require(balanceStable() >= delStable + balStable, "Stable");

        Reserve.Data storage reserve = reserves[poolId];
        reserve.allocate(delRisky, delStable, delLiquidity, _blockTimestamp());
        positions.fetch(msg.sender, poolId).allocate(delLiquidity - 1000); // give liquidity to `msg.sender`, burn 1000 wei
        settings[poolId] = Calibration({
            strike: strike.toUint128(),
            sigma: sigma,
            time: time,
            blockTimestamp: _blockTimestamp()
        });
        emit Created(msg.sender, strike, sigma, time);
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
        (uint256 resLiquidity, uint256 resRisky, uint256 resStable) =
            (reserve.liquidity, reserve.reserveRisky, reserve.reserveStable);

        require(resLiquidity > 0, "Not initialized");
        delRisky = (resRisky * delLiquidity) / resLiquidity; // amount of risky tokens to provide
        delStable = (resStable * delLiquidity) / resLiquidity; // amount of stable tokens to provide
        require(delRisky * delStable > 0, "Deltas are 0");

        if (fromMargin) {
            margins.withdraw(delRisky, delStable); // removes tokens from `msg.sender` margin account, notice the mapping
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
        (uint256 resRisky, uint256 resStable, uint256 resLiquidity) =
            (reserve.reserveRisky, reserve.reserveStable, reserve.liquidity);

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
        uint256 amountOut;
        uint256 amountInMax;
        bool riskyForStable;
        bool fromMargin;
    }

    /// @inheritdoc IPrimitiveEngineActions
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaOut,
        uint256 deltaInMax,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 deltaIn) {
        require(deltaOut > 0, "Zero");
        SwapDetails memory details =
            SwapDetails({
                poolId: poolId,
                amountOut: deltaOut,
                amountInMax: deltaInMax,
                riskyForStable: riskyForStable,
                fromMargin: fromMargin
            });

        int128 invariant = invariantOf(details.poolId); // gas savings
        Reserve.Data storage reserve = reserves[details.poolId]; // gas savings
        (uint256 resRisky, uint256 resStable) = (reserve.reserveRisky, reserve.reserveStable);

        if (details.riskyForStable) {
            uint256 nextRisky = compute(details.poolId, risky, resStable - details.amountOut).parseUnits();
            deltaIn = ((nextRisky - resRisky) * 10000) / 9985; // nextRisky = resRisky + detlaIn * (1 - fee)
        } else {
            uint256 nextStable = compute(details.poolId, stable, resRisky - details.amountOut).parseUnits();
            deltaIn = ((nextStable - resStable) * 10000) / 9985; // nextStable = resStable + detlaIn * (1 - fee)
        }

        require(details.amountInMax >= deltaIn, "Too expensive");

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

            reserve.swap(details.riskyForStable, amountIn, details.amountOut, _blockTimestamp());
            require(invariantOf(details.poolId) >= invariant, "Invariant");
            emit Swap(msg.sender, details.poolId, details.riskyForStable, amountIn, details.amountOut);
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
        address recipient,
        uint256 delLiquidity,
        uint256 maxPremium,
        bytes calldata data
    ) external override lock {
        Reserve.Data storage reserve = reserves[poolId];
        {
            uint256 delLiquidity = delLiquidity;
            require(reserve.float >= delLiquidity && delLiquidity > 0, "Insufficient float"); // fail early if not enough float to borrow

            uint256 resLiquidity = reserve.liquidity; // global liquidity balance
            uint256 delRisky = (delLiquidity * reserve.reserveRisky) / resLiquidity; // amount of risky asset
            uint256 delStable = (delLiquidity * reserve.reserveStable) / resLiquidity; // amount of stable asset

            {
                uint256 preRisky = IERC20(risky).balanceOf(address(this));
                uint256 preStable = IERC20(stable).balanceOf(address(this));

                // trigger callback before position debt is increased, so liquidity can be removed
                IERC20(stable).safeTransfer(msg.sender, delStable);
                IPrimitiveLendingCallback(msg.sender).borrowCallback(delLiquidity, delRisky, delStable, data); // trigger the callback so we can remove liquidity
                positions.borrow(poolId, delLiquidity); // increase liquidity + debt
                // fails if risky asset balance is less than borrowed `delLiquidity`
                reserve.remove(delRisky, delStable, delLiquidity, _blockTimestamp());
                reserve.borrowFloat(delLiquidity);

                uint256 postRisky = IERC20(risky).balanceOf(address(this));
                uint256 postRiskless = IERC20(stable).balanceOf(address(this));

                require(postRisky >= preRisky + (delLiquidity - delRisky), "IRY");
                require(postRiskless >= preStable - delStable, "IRL");
            }

            emit Borrowed(recipient, poolId, delLiquidity, maxPremium);
        }
    }

    /// @inheritdoc IPrimitiveEngineActions
    /// @dev    Reverts if pos.debt is 0, or delLiquidity >= pos.liquidity (not enough of a balance to pay debt)
    function repay(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external override lock returns (uint256 deltaRisky, uint256 deltaStable) {
        Reserve.Data storage reserve = reserves[poolId];
        Position.Data storage position = positions.fetch(owner, poolId);
        Margin.Data storage margin = margins[owner];

        require(reserve.debt >= delLiquidity && position.liquidity >= delLiquidity, "ID");

        deltaRisky = (delLiquidity * reserve.reserveRisky) / reserve.liquidity;
        deltaStable = (delLiquidity * reserve.reserveStable) / reserve.liquidity;

        if (fromMargin) {
            margins.withdraw(delLiquidity - deltaRisky, deltaStable); // reduce margin balance
            reserve.allocate(deltaRisky, deltaStable, delLiquidity, _blockTimestamp()); // increase reserve liquidity
            position.repay(delLiquidity); // reduce position debt
        } else {
            uint256 preStable = IERC20(stable).balanceOf(address(this));
            IPrimitiveLendingCallback(msg.sender).repayFromExternalCallback(deltaStable, data);

            require(IERC20(stable).balanceOf(address(this)) >= preStable + deltaStable, "IS");

            reserve.allocate(deltaRisky, deltaStable, delLiquidity, _blockTimestamp());
            reserve.repayFloat(delLiquidity);
            position.repay(delLiquidity);
            margin.deposit(delLiquidity - deltaRisky, uint256(0));
        }

        emit Repaid(owner, poolId, delLiquidity);
    }

    // ===== Swap and Liquidity Math =====

    /// @inheritdoc IPrimitiveEngineView
    function compute(
        bytes32 poolId,
        address token,
        uint256 balance
    ) public view override returns (int128 reserveOfToken) {
        require(token == risky || token == stable, "Not an engine token");
        Calibration memory cal = settings[poolId];
        Reserve.Data memory res = reserves[poolId];
        (uint256 liquidity, uint256 strike, uint256 sigma, uint256 time) =
            (uint256(res.liquidity), uint256(cal.strike), uint256(cal.sigma), cal.time);
        int128 invariant = invariantOf(poolId);
        console.log(time, _blockTimestamp());
        uint256 timeDelta = time - _blockTimestamp();

        console.log(timeDelta);
        if (token == risky) {
            reserveOfToken = (ReplicationMath.getInverseTradingFunction(balance, liquidity, strike, sigma, timeDelta))
                .sub(invariant);
        } else {
            reserveOfToken = ReplicationMath.getTradingFunction(balance, liquidity, strike, sigma, timeDelta).add(
                invariant
            );
        }
    }

    // ===== View =====

    /// @inheritdoc IPrimitiveEngineView
    function calcInvariant(
        bytes32 poolId,
        uint256 nextRisky,
        uint256 nextStable,
        uint256 postLiquidity
    ) public view override returns (int128 invariant) {
        Calibration memory cal = settings[poolId];
        invariant = ReplicationMath.calcInvariant(
            nextRisky,
            nextStable,
            postLiquidity,
            uint256(cal.strike),
            uint256(cal.sigma),
            uint256(cal.time)
        );
    }

    /// @inheritdoc IPrimitiveEngineView
    function invariantOf(bytes32 poolId) public view override returns (int128 invariant) {
        Reserve.Data memory res = reserves[poolId];
        invariant = calcInvariant(poolId, res.reserveRisky, res.reserveStable, res.liquidity);
    }

    /// @inheritdoc IPrimitiveEngineView
    function getPoolId(
        uint256 strike,
        uint64 sigma,
        uint32 time
    ) public view override returns (bytes32 poolId) {
        poolId = keccak256(abi.encodePacked(factory, time, sigma, strike));
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
