// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Primitive Factory
/// @author  Primitive
/// @notice  No access controls are available to owner
/// @dev     Deploy new PrimitiveEngine contracts

import "./interfaces/IPrimitiveFactory.sol";
import "./PrimitiveEngine.sol";

contract PrimitiveFactory is IPrimitiveFactory {
    /// @notice Thrown when the risky and stable tokens are the same
    error SameTokenError();

    /// @notice Thrown when the risky or the stable token is 0x0...
    error ZeroAddressError();

    /// @inheritdoc IPrimitiveFactory
    address public override owner;

    /// @inheritdoc IPrimitiveFactory
    mapping(address => mapping(address => address)) public override getEngine;

    struct Args {
        address factory;
        address risky;
        address stable;
    }

    /// @inheritdoc IPrimitiveFactory
    Args public override args; // Used instead of an initializer in Engine contract

    constructor() {
        owner = msg.sender;
    }

    /// @inheritdoc IPrimitiveFactory
    function deploy(address risky, address stable) external override returns (address engine) {
        if (risky == stable) revert SameTokenError();
        if (risky == address(0) || stable == address(0)) revert ZeroAddressError();

        engine = deploy(address(this), risky, stable);
        getEngine[risky][stable] = engine;
        emit Deployed(msg.sender, risky, stable, engine);
    }

    /// @notice         Deploys an engine contract with a `salt`.
    /// @dev            Engine contract should have no constructor args, because this affects the deployed address
    ///                 From solidity docs:
    ///                 "It will compute the address from the address of the creating contract,
    ///                 the given salt value, the (creation) bytecode of the created contract,
    ///                 and the constructor arguments."
    /// @param  factory Address of the deploying smart contract
    /// @param  risky   Risky token address, underlying token
    /// @param  stable  Stable token address, quote token
    /// @return engine  Engine contract address which was deployed
    function deploy(
        address factory,
        address risky,
        address stable
    ) internal returns (address engine) {
        args = Args({factory: factory, risky: risky, stable: stable}); // Engines call this to get constructor args
        engine = address(new PrimitiveEngine{salt: keccak256(abi.encode(risky, stable))}());
        delete args;
    }
}
