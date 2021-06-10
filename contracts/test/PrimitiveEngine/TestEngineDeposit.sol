// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPrimitiveEngine.sol";

contract TestEngineDeposit {
    using SafeERC20 for IERC20;

    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    function deposit(
      address _engine,
      address _risky,
      address _stable,
      address owner,
      uint256 dRisky,
      uint256 dStable
    ) public {
      engine = _engine;
      risky = _risky;
      stable = _stable;
      CALLER = msg.sender;
      IPrimitiveEngine(engine).deposit(owner, dRisky, dStable);
    }

    function depositCallback(uint256 dRisky, uint256 dStable) public {
        IERC20(risky).safeTransferFrom(CALLER, engine, dRisky);
        IERC20(stable).safeTransferFrom(CALLER, engine, dStable);
      engine = address(0);
      risky = address(0);
      stable = address(0);
    }

    function name() public view returns (string memory) {
      return "EngineDeposit";
    }
}
