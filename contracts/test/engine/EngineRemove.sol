// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineRemove {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

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

    function getPosition(bytes32 poolId) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), poolId));
    }

    function name() public pure returns (string memory) {
        return "EngineRemove";
    }
}
