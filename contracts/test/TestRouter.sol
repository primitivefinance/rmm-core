// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "./TestBase.sol";
import "../libraries/ReplicationMath.sol";

contract TestRouter is TestBase {
    constructor(address engine_) TestBase(engine_) {}

    // ===== Create =====

    function create(
        uint256 strike,
        uint256 sigma,
        uint256 maturity,
        uint256 gamma,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).create(
            uint128(strike),
            uint32(sigma),
            uint32(maturity),
            uint32(gamma),
            riskyPerLp,
            delLiquidity,
            data
        );
    }

    // ===== Margin =====

    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
    }

    function depositFail(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.FAIL;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositReentrancy(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.REENTRANCY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositOnlyRisky(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.RISKY_ONLY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositOnlyStable(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.STABLE_ONLY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function withdraw(uint256 delRisky, uint256 delStable) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).withdraw(msg.sender, delRisky, delStable);
    }

    function withdrawToRecipient(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).withdraw(recipient, delRisky, delStable);
    }

    // ===== Allocate =====

    function allocate(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromMargin(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, true, data);
    }

    function allocateFromExternal(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalNoRisky(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.STABLE_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalNoStable(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.RISKY_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalReentrancy(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.REENTRANCY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    // ===== Remove =====

    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        IPrimitiveEngine(engine).remove(poolId, delLiquidity);
    }

    function removeToMargin(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        IPrimitiveEngine(engine).remove(poolId, delLiquidity);
    }

    function removeToExternal(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        (uint256 delRisky, uint256 delStable) = IPrimitiveEngine(engine).remove(poolId, delLiquidity);
        IPrimitiveEngine(engine).withdraw(msg.sender, delRisky, delStable);
    }

    // ===== Swaps =====

    function swap(
        address recipient,
        bytes32 pid,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).swap(recipient, pid, riskyForStable, deltaIn, deltaOut, fromMargin, toMargin, data);
    }

    function getStableOutGivenRiskyIn(bytes32 poolId, uint256 deltaIn) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        uint256 amountInWithFee = (deltaIn * gamma) / 1e4;
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextRisky = ((uint256(reserveRisky) + amountInWithFee) * lens.PRECISION()) / liquidity;
        uint256 nextStable = ReplicationMath.getStableGivenRisky(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextRisky,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaOut = uint256(reserveStable) - (nextStable * liquidity) / lens.PRECISION();
        return deltaOut;
    }

    function getRiskyOutGivenStableIn(bytes32 poolId, uint256 deltaIn) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        uint256 amountInWithFee = (deltaIn * gamma) / 1e4;
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextStable = ((uint256(reserveStable) + amountInWithFee) * lens.PRECISION()) / liquidity;
        uint256 nextRisky = ReplicationMath.getRiskyGivenStable(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextStable,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaOut = uint256(reserveRisky) - (nextRisky * liquidity) / lens.PRECISION();
        return deltaOut;
    }

    function getStableInGivenRiskyOut(bytes32 poolId, uint256 deltaOut) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextRisky = ((uint256(reserveRisky) - deltaOut) * lens.PRECISION()) / liquidity;
        uint256 nextStable = ReplicationMath.getStableGivenRisky(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextRisky,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaIn = (nextStable * liquidity) / lens.PRECISION() - uint256(reserveStable);
        uint256 deltaInWithFee = (deltaIn * 1e4) / gamma + 1;
        return deltaInWithFee;
    }

    function getRiskyInGivenStableOut(bytes32 poolId, uint256 deltaOut) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextStable = ((uint256(reserveStable) - deltaOut) * lens.PRECISION()) / liquidity;
        uint256 nextRisky = ReplicationMath.getRiskyGivenStable(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextStable,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaIn = (nextRisky * liquidity) / lens.PRECISION() - uint256(reserveRisky);
        uint256 deltaInWithFee = (deltaIn * 1e4) / gamma + 1;
        return deltaInWithFee;
    }

    function name() public pure override(TestBase) returns (string memory) {
        return "TestRouter";
    }
}
