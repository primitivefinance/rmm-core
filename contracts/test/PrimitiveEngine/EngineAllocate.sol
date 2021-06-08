// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPrimitiveEngine.sol";

contract EngineAllocate {
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

    function allocateFromMargin(bytes32 pid, address owner, uint dLiquidity) public  {
        IPrimitiveEngine(engine).allocate(pid, address(this),  dLiquidity, true);
    }

    function allocateFromExternal(bytes32 pid, address owner, uint dLiquidity) public  {
        IPrimitiveEngine(engine).allocate(pid, address(this),  dLiquidity, false);
    }

    function allocateCallback(uint dRisky, uint dStable) public {
        if(dRisky > 0) IERC20(risky).safeTransferFrom(CALLER, msg.sender, dRisky);
        if(dStable > 0) IERC20(stable).safeTransferFrom(CALLER, msg.sender, dStable);
    }

    function name() public view returns (string memory) {
      return "EngineAllocate";
    }
}

