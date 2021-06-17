// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineBorrow {

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

    function borrow(bytes32 pid, address owner, uint dLiquidity, bytes calldata data) public {
      CALLER = msg.sender;
      IPrimitiveEngine(engine).borrow(pid, owner, dLiquidity, type(uint256).max, data);
    }

    function borrowCallback(uint dLiquidity, uint dRisky, uint dStable, bytes calldata data) public {
      uint riskyNeeded = dLiquidity - dRisky;

      IERC20(risky).transferFrom(CALLER, msg.sender, riskyNeeded);
      IERC20(stable).transfer(CALLER, dStable);
    }

    function getPosition(bytes32 pid) public view returns(bytes32 posid) {
      posid = keccak256(abi.encodePacked(address(this), pid));
    }

    function name() public view returns (string memory) {
      return "EngineBorrow";
    }
}

