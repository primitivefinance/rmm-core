// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineDeposit {
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

    function deposit(address owner, uint256 dRisky, uint256 dStable, bytes calldata data) public { 
      CALLER = msg.sender;
      IPrimitiveEngine(engine).deposit(owner, dRisky, dStable, data);
    }

    function depositCallback(uint256 dRisky, uint256 dStable, bytes calldata data) public {
        IERC20(risky).transferFrom(CALLER, engine, dRisky);
        IERC20(stable).transferFrom(CALLER, engine, dStable);
    }

    function name() public pure returns (string memory) {
      return "EngineDeposit";
    }
}

