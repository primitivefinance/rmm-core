// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveFactory.sol";

contract FactoryDeploy {
    address public factory;

    constructor() {}

    function initialize(address factory_) public {
        factory = factory_;
    }

    function deploy(address risky, address riskless) public {
        IPrimitiveFactory(factory).deploy(risky, riskless);
    }

    function name() public pure returns (string memory) {
        return "FactoryDeploy";
    }
}
