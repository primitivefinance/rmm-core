// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "./TestBase.sol";

import "hardhat/console.sol";

contract TestRouter is TestBase {
    constructor(address engine_) TestBase(engine_) {}

    // ===== Create =====

    function create(
        uint256 strike,
        uint256 sigma,
        uint256 maturity,
        uint256 delta,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).create(strike, uint64(sigma), uint32(maturity), delta, delLiquidity, data);
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

    function allocateFromMargin(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, true, data);
    }

    function allocateFromExternal(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalNoRisky(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.STABLE_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalNoStable(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.RISKY_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalReentrancy(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.REENTRANCY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    // ===== Remove =====

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
        bytes32 pid,
        bool riskyForStable,
        uint256 deltaOut,
        bool fromMargin,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).swap(pid, riskyForStable, deltaOut, fromMargin, data);
    }

    // ===== Supply and Claim =====
    function supply(bytes32 poolId, uint256 dLiquidity) public {
        IPrimitiveEngine(engine).supply(poolId, dLiquidity);
    }

    function claim(bytes32 poolId, uint256 dLiquidity) public {
        IPrimitiveEngine(engine).claim(poolId, dLiquidity);
    }

    // ===== Borrow =====

    function borrow(
        bytes32 poolId,
        address owner,
        uint256 collateralRisky,
        uint256 collateralStable,
        bytes calldata data
    ) public {
        owner;
        caller = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, collateralRisky, collateralStable, false, data);
    }

    function borrowWithMargin(
        bytes32 poolId,
        address owner,
        uint256 collateralRisky,
        uint256 collateralStable,
        bytes calldata data
    ) public {
        owner;
        caller = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, collateralRisky, collateralStable, true, data);
    }

    function borrowMaxPremium(
        bytes32 poolId,
        address owner,
        uint256 collateralRisky,
        uint256 collateralStable,
        bytes calldata data
    ) public {
        owner;
        caller = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, collateralRisky, collateralStable, false, data);
    }

    function borrowWithoutPaying(
        bytes32 poolId,
        address owner,
        uint256 collateralRisky,
        uint256 collateralStable,
        bytes calldata data
    ) public {
        owner;
        caller = msg.sender;
        scenario = Scenario.FAIL;
        IPrimitiveEngine(engine).borrow(poolId, collateralRisky, collateralStable, false, data);
        scenario = Scenario.SUCCESS;
    }

    // ===== Repay =====

    function repay(
        bytes32 poolId,
        address owner,
        uint256 riskyToLiquidate,
        uint256 stableToLiquidate,
        bool fromMargin,
        bytes calldata data
    ) external {
        caller = msg.sender;
        IPrimitiveEngine(engine).repay(poolId, owner, riskyToLiquidate, stableToLiquidate, fromMargin, data);
    }

    function repayWithoutRepaying(
        bytes32 poolId,
        address owner,
        uint256 collateralRisky,
        uint256 collateralStable,
        bool fromMargin,
        bytes calldata data
    ) external {
        caller = msg.sender;
        scenario = Scenario.FAIL;
        IPrimitiveEngine(engine).repay(poolId, owner, collateralRisky, collateralStable, fromMargin, data);
        scenario = Scenario.SUCCESS;
    }

    function name() public pure override(TestBase) returns (string memory) {
        return "TestRouter";
    }
}