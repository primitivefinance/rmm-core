// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineAllocate {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    constructor() {}

    function initialize(address _engine, address _risky, address _stable) public {
      engine = _engine;
      risky = _risky;
      stable = _stable;
    }

    function allocateFromMargin(bytes32 pid, address owner, uint dLiquidity, bytes calldata data) public  {
        IPrimitiveEngine(engine).allocate(pid, owner,  dLiquidity, true, data);
    }

    function allocateFromExternal(bytes32 pid, address owner, uint dLiquidity, bytes calldata data) public  {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).allocate(pid, owner,  dLiquidity, false, data);
    }

    function allocateCallback(uint dRisky, uint dStable, bytes calldata data) public {
        IERC20(risky).transferFrom(CALLER, msg.sender, dRisky);
        IERC20(stable).transferFrom(CALLER, msg.sender, dStable);
    }

    function getPosition(bytes32 pid) public view returns(bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), pid));
    }

    function name() public pure returns (string memory) {
      return "EngineAllocate";
    }
}

