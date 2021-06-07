// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/engine/IPrimitiveEngineView.sol";

contract TestCalleeCreate {
    using SafeERC20 for IERC20;

    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    constructor(address _engine, address _risky, address _stable) {
      engine = _engine;
      risky = _risky;
      stable = _stable;
    }

    function getEngineRisky() public view returns (address risky) {
      risky = IPrimitiveEngineView(engine).risky();
    }

    function createPool(uint strike, uint sigma, uint time, uint riskyPrice) public { 
      CALLER = msg.sender;
      address tx1 = IPrimitiveEngineView(engine).risky();
      //IPrimitiveEngine(engine).create(strike, sigma, time, riskyPrice);
    }

    function createCallback(uint deltaX, uint deltaY) public {
        IERC20(risky).safeTransferFrom(CALLER, engine, deltaX);
        IERC20(stable).safeTransferFrom(CALLER, engine, deltaY);
    }

    function name() public view returns (string memory) {
      return "TestCalleeCreate";
    }
}

