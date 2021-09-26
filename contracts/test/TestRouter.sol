// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "./TestBase.sol";

contract TestRouter is TestBase {
    constructor(address engine_) TestBase(engine_) {}

    // ===== Create =====

    function create(
        uint256 strike,
        uint256 sigma,
        uint256 maturity,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).create(strike, uint64(sigma), uint32(maturity), riskyPerLp, delLiquidity, data);
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
        uint256 deltaOut,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).swap(recipient, pid, riskyForStable, deltaOut, fromMargin, toMargin, data);
    }

    function name() public pure override(TestBase) returns (string memory) {
        return "TestRouter";
    }
}
