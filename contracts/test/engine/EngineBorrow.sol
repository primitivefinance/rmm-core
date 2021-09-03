// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

import "hardhat/console.sol";

contract EngineBorrow {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    uint256 public dontPay = 1;
    uint256 public dontRepay = 1;

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
        uint256 collateralRisky,
        uint256 collateralStable,
        bytes calldata data
    ) public {
        owner;
        CALLER = msg.sender;
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
        CALLER = msg.sender;
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
        CALLER = msg.sender;
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
        CALLER = msg.sender;
        dontPay = 0;
        IPrimitiveEngine(engine).borrow(poolId, collateralRisky, collateralStable, false, data);
        dontPay = 1;
    }

    function borrowCallback(
        uint256 riskyDeficit,
        uint256 stableDeficit,
        bytes calldata data
    ) public {
        data;
        if (dontPay == 0) return;
        if (riskyDeficit > 0) IERC20(risky).transferFrom(CALLER, msg.sender, riskyDeficit);
        if (stableDeficit > 0) IERC20(stable).transferFrom(CALLER, msg.sender, stableDeficit);
        IERC20(risky).transfer(CALLER, IERC20(risky).balanceOf(address(this)));
        IERC20(stable).transfer(CALLER, IERC20(stable).balanceOf(address(this)));
    }

    function repay(
        bytes32 poolId,
        address owner,
        uint256 riskyToLiquidate,
        uint256 stableToLiquidate,
        bool fromMargin,
        bytes calldata data
    ) external {
        CALLER = msg.sender;
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
        CALLER = msg.sender;
        dontRepay = 0;
        IPrimitiveEngine(engine).repay(poolId, owner, collateralRisky, collateralStable, fromMargin, data);
        dontRepay = 1;
    }

    function repayCallback(
        uint256 riskyDeficit,
        uint256 stableDeficit,
        bytes calldata data
    ) external {
        data;
        if (dontRepay == 0) return;
        if (riskyDeficit > 0) IERC20(risky).transferFrom(CALLER, msg.sender, (riskyDeficit));
        if (stableDeficit > 0) IERC20(stable).transferFrom(CALLER, msg.sender, (stableDeficit));
        IERC20(risky).transfer(CALLER, IERC20(risky).balanceOf(address(this)));
        IERC20(stable).transfer(CALLER, IERC20(stable).balanceOf(address(this)));
    }

    function getPosition(bytes32 poolId) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), poolId));
    }

    function name() public pure returns (string memory) {
        return "EngineBorrow";
    }
}
