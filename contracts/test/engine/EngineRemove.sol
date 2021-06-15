// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

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
        bytes32 pid,
        uint256 dLiquidity,
        bytes memory data
    ) public {
        IPrimitiveEngine(engine).remove(pid, dLiquidity, true, data);
    }

    function removeToExternal(
        bytes32 pid,
        uint256 dLiquidity,
        bytes memory data
    ) public {
        IPrimitiveEngine(engine).remove(pid, dLiquidity, false, data);
    }

    function removeCallback(
        uint256 dRisky,
        uint256 dStable,
        bytes memory data
    ) public {
        return;
    }

    function getPosition(bytes32 pid) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), pid));
    }

    function name() public view returns (string memory) {
        return "EngineRemove";
    }
}
