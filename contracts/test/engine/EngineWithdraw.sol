// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract EngineWithdraw {
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

    function withdraw(uint256 dRisky, uint256 dStable) public {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).withdraw(dRisky, dStable);
        IERC20(risky).transfer(CALLER, dRisky);
        IERC20(stable).transfer(CALLER, dStable);
    }

    function name() public pure returns (string memory) {
        return "EngineWithdraw";
    }
}
