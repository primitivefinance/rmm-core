// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @title   Primitive Factory
/// @author  Primitive
/// @dev     Generate PrimitiveEngine contracts

import "./interfaces/IPrimitiveFactory.sol";
import "./PrimitiveEngine.sol";

contract PrimitiveFactory is IPrimitiveFactory {
    event EngineCreated(address indexed from, address indexed risky, address indexed stable, address engine);

    address public override owner;

    mapping(address => mapping(address => address)) public override getEngine;

    struct Args {
        address factory;
        address risky;
        address stable;
    }

    Args public override args; // Used instead of an initializer in Engine contract

    constructor() {
        owner = msg.sender;
    }

    /// @notice Deploys a new Engine contract and sets the `getEngine` mapping for the tokens
    function create(address risky, address stable) external override returns (address engine) {
        require(risky != stable, "Cannot be same token");
        require(risky != address(0), "Cannot be zero address");
        require(stable != address(0), "Cannot be zero address");
        engine = deploy(address(this), risky, stable);
        getEngine[risky][stable] = engine;
        getEngine[stable][risky] = engine;
        emit EngineCreated(msg.sender, risky, stable, engine);
    }

    /// @notice Deploys an engine contract with a `salt`.
    /// @dev    The Engine contract should have no constructor args, because this affects the deployed address
    ///         From solidity docs: 
    ///         "It will compute the address from the address of the creating contract, 
    ///         the given salt value, the (creation) bytecode of the created contract and the constructor arguments."
    function deploy(address factory, address risky, address stable) internal returns (address engine) {
        args = Args({factory: factory, risky: risky, stable: stable}); // Engines call this to get constructor args
        engine = address(new PrimitiveEngine{salt: keccak256(abi.encode(risky, stable))}());
        delete args;
    }
}