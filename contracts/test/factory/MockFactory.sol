pragma solidity 0.8.0;

import "../../interfaces/IPrimitiveFactory.sol";
import "../engine/MockEngine.sol";

contract MockFactory is IPrimitiveFactory {
    address public override owner;
    mapping(address => mapping(address => address)) public override getEngine;

    constructor() {
        owner = msg.sender;
    }

    struct Args {
        address factory;
        address risky;
        address stable;
    }

    Args public override args; // Used instead of an initializer in Engine contract

    function deploy(address risky, address stable) external override returns (address engine) {
        require(risky != stable, "Cannot be same token");
        require(risky != address(0) && stable != address(0), "Cannot be zero address");
        args = Args({factory: address(this), risky: risky, stable: stable}); // Engines call this to get constructor args
        engine = address(new MockEngine{salt: keccak256(abi.encode(risky, stable))}());
        getEngine[risky][stable] = engine;
        emit Deployed(msg.sender, risky, stable, engine);
        delete args;
    }
}
