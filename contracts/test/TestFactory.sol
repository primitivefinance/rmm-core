// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/**
 * @title   Engine TEST contract
 * @author  Primitive
 * @dev     ONLY FOR TESTING PURPOSES.  
 */

import "../interfaces/IPrimitiveFactory.sol";
import "./TestEngine.sol";

contract TestFactory is IPrimitiveFactory {
    event EngineCreated(address indexed from, address indexed risky, address indexed riskless, address engine);

    address public override owner;

    mapping(address => mapping(address => address)) public override getEngine;

    struct Args {
        address factory;
        address risky;
        address riskless;
    }

    Args public override args; // Used instead of an initializer in Engine contract

    constructor() {
        owner = msg.sender;
    }

    /// @notice Deploys a new Engine contract and sets the `getEngine` mapping for the tokens
    function create(address risky, address riskless) external override returns (address engine) {
        require(risky != riskless, "Cannot be same token");
        require(risky != address(0), "Cannot be zero address");
        require(riskless != address(0), "Cannot be zero address");
        engine = deploy(address(this), risky, riskless);
        getEngine[risky][riskless] = engine;
        getEngine[riskless][risky] = engine;
        emit EngineCreated(msg.sender, risky, riskless, engine);
    }

    /// @notice Deploys an engine contract with a `salt`.
    /// @dev    The Engine contract should have no constructor args, because this affects the deployed address
    ///         From solidity docs: 
    ///         "It will compute the address from the address of the creating contract, 
    ///         the given salt value, the (creation) bytecode of the created contract and the constructor arguments."
    function deploy(address factory, address risky, address riskless) internal returns (address engine) {
        args = Args({factory: factory, risky: risky, riskless: riskless}); // Engines call this to get constructor args
        engine = address(new TestEngine{salt: keccak256(abi.encode(risky, riskless))}());
        delete args;
    }
}