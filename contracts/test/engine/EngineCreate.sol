// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IPrimitiveEngine.sol";

import "hardhat/console.sol";

contract EngineCreate {
    using SafeERC20 for IERC20;

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

    function create(uint strike, uint sigma, uint time, uint riskyPrice, uint dLiquidity, bytes calldata data) public {
      CALLER = msg.sender;
      IPrimitiveEngine(engine).create(strike, sigma, time, riskyPrice, dLiquidity, data);
    }

    function createCallback(uint deltaX, uint deltaY, bytes calldata data) public {
        IERC20(risky).safeTransferFrom(CALLER, engine, deltaX);
        IERC20(stable).safeTransferFrom(CALLER, engine, deltaY);
    }

    function name() public view returns (string memory) {
      return "EngineCreate";
    }
}

