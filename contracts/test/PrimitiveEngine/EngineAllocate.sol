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

    constructor() {}

    function initialize(address _engine, address _risky, address _stable) public {
      engine = _engine;
      risky = _risky;
      stable = _stable;
    }

    function allocateFromMargin(bytes32 pid, address owner, uint dLiquidity) public  {
        IPrimitiveEngine(engine).allocate(pid, address(this),  dLiquidity, true);
    }

    function allocateFromExternal(bytes32 pid, address owner, uint dLiquidity, bytes calldata data) public  {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).allocate(pid, address(this),  dLiquidity, false, data);
    }

    function allocateCallback(uint dRisky, uint dStable, bytes calldata data) public {
        IERC20(risky).safeTransferFrom(CALLER, msg.sender, dRisky);
        IERC20(stable).safeTransferFrom(CALLER, msg.sender, dStable);
    }

    function getPosition(bytes32 pid) public view returns(bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), pid));
    }

    function name() public view returns (string memory) {
      return "EngineAllocate";
    }
}

