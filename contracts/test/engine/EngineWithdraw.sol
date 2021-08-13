// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

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

    function withdraw(uint256 delRisky, uint256 delStable) public {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).withdraw(msg.sender, delRisky, delStable);
    }

    function withdrawToRecipient(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).withdraw(recipient, delRisky, delStable);
    }

    function name() public pure returns (string memory) {
        return "EngineWithdraw";
    }
}
