// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

import "hardhat/console.sol";

contract BadEngineDeposit {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    uint256 private currentScenario;

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

    function deposit(
        address owner,
        uint256 dRisky,
        uint256 dStable,
        bytes calldata data,
        uint256 scenario
    ) public {
        CALLER = msg.sender;
        currentScenario = scenario;
        IPrimitiveEngine(engine).deposit(owner, dRisky, dStable, data);
    }

    function depositCallback(
        uint256 dRisky,
        uint256 dStable,
        bytes calldata data
    ) public {
        if (currentScenario == 0) {
            IERC20(risky).transferFrom(CALLER, engine, dRisky);
            console.log("Transferring only the risky");
        } else if (currentScenario == 1) {
            IERC20(stable).transferFrom(CALLER, engine, dStable);
            console.log("Transferring only the stable");
        } else {
            console.log("Transferring nothing");
        }
    }

    function name() public pure returns (string memory) {
        return "BadEngineDeposit";
    }
}
