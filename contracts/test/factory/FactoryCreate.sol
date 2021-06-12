// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveFactory.sol";

contract FactoryCreate {
    address public factory;

    constructor() {}

    function initialize(address factory_) public {
      factory = factory_;
    }

    function create(address risky, address riskless) public { 
      IPrimitiveFactory(factory).create(risky, riskless);

    }

    function name() public view returns (string memory) {
      return "FactoryCreate";
    }
}

