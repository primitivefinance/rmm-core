// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineBorrow {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    uint256 public dontPay = 1;

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

    function borrow(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        owner;
        CALLER = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, false, data);
    }

    function borrowWithMargin(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        owner;
        CALLER = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, true, data);
    }

    function borrowMaxPremium(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        owner;
        CALLER = msg.sender;
        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, false, data);
    }

    function borrowWithoutPaying(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        owner;
        CALLER = msg.sender;
        dontPay = 0;
        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, false, data);
        dontPay = 1;
    }

    function borrowCallback(
        uint256 delLiquidity,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        data;
        uint256 riskyNeeded = delLiquidity - delRisky;
        if (dontPay == 0) return;
        IERC20(risky).transferFrom(CALLER, msg.sender, riskyNeeded);
        IERC20(stable).transfer(CALLER, delStable);
    }

    function repay(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).repay(poolId, owner, delLiquidity, fromMargin, data);
    }

    function repayCallback(uint256 delStable, bytes calldata data) external {
        data;
        IERC20(stable).transferFrom(CALLER, msg.sender, delStable);
        IERC20(risky).transfer(CALLER, IERC20(risky).balanceOf(address(this)));
    }

    function getPosition(bytes32 poolId) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), poolId));
    }

    function name() public pure returns (string memory) {
        return "EngineBorrow";
    }
}
