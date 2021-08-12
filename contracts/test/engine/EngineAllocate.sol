// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineAllocate {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    uint256 private scenario;

    constructor() {}

    function initialize(
        address _engine,
        address _risky,
        address _stable
    ) public {
        engine = _engine;
        risky = _risky;
        stable = _stable;
    }

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
        CALLER = msg.sender;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalNoRisky(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;
        scenario = 1;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalNoStable(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;
        scenario = 2;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateFromExternalReentrancy(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;
        scenario = 3;
        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        data;

        if (scenario == 1) {
            IERC20(risky).transferFrom(CALLER, msg.sender, delRisky);
        } else if (scenario == 2) {
            IERC20(stable).transferFrom(CALLER, msg.sender, delStable);
        } else if (scenario == 3) {
            IPrimitiveEngine(engine).allocate(bytes32(0), address(0x0), 1, false, new bytes(0));
        } else {
            IERC20(risky).transferFrom(CALLER, msg.sender, delRisky);
            IERC20(stable).transferFrom(CALLER, msg.sender, delStable);
        }
        scenario = 0;
        CALLER = address(0x0);
    }

    function getPosition(bytes32 poolId) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), poolId));
    }

    function name() public pure returns (string memory) {
        return "EngineAllocate";
    }
}
