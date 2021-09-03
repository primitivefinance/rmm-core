// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveFactory.sol";
import "../engine/MockEngine.sol";

contract MockFactory is IPrimitiveFactory {
    error SameTokenError();
    error ZeroAddressError();

    address public override owner;
    mapping(address => mapping(address => address)) public override getEngine;

    constructor() {
        owner = msg.sender;
    }

    struct Args {
        address factory;
        address risky;
        address stable;
        uint256 precisionRisky;
        uint256 precisionStable;
    }

    Args public override args; // Used instead of an initializer in Engine contract

    function deploy(address risky, address stable) external override returns (address engine) {
        if (risky == stable) revert SameTokenError();
        if (risky == address(0) || stable == address(0)) revert ZeroAddressError();
        uint256 precisionRisky = 10**(IERC20(risky).decimals());
        uint256 precisionStable = 10**(IERC20(stable).decimals());
        args = Args({
            factory: address(this),
            risky: risky,
            stable: stable,
            precisionRisky: precisionRisky,
            precisionStable: precisionStable
        }); // Engines call this to get constructor args
        engine = address(new MockEngine{salt: keccak256(abi.encode(risky, stable))}());
        getEngine[risky][stable] = engine;
        emit Deployed(msg.sender, risky, stable, engine);
        delete args;
    }
}
