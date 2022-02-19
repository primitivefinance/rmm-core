// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveFactory.sol";
import "../engine/MockEngine.sol";

contract MockFactory is IPrimitiveFactory {
    error SameTokenError();
    error ZeroAddressError();

    /// @inheritdoc IPrimitiveFactory
    uint256 public constant override MIN_LIQUIDITY_FACTOR = 6;
    /// @inheritdoc IPrimitiveFactory
    address public immutable override deployer;
    mapping(address => mapping(address => address)) public override getEngine;

    constructor() {
        deployer = msg.sender;
    }

    struct Args {
        address factory;
        address risky;
        address stable;
        uint256 scaleFactorRisky;
        uint256 scaleFactorStable;
        uint256 minLiquidity;
    }

    Args public override args; // Used instead of an initializer in Engine contract

    function deploy(address risky, address stable) external override returns (address engine) {
        if (risky == stable) revert SameTokenError();
        if (risky == address(0) || stable == address(0)) revert ZeroAddressError();
        uint256 riskyDecimals = IERC20(risky).decimals();
        uint256 stableDecimals = IERC20(stable).decimals();
        uint256 scaleFactorRisky = 10**(18 - riskyDecimals);
        uint256 scaleFactorStable = 10**(18 - stableDecimals);
        uint256 minLiquidity = 10**((riskyDecimals > stableDecimals ? stableDecimals : riskyDecimals) / 6);
        args = Args({
            factory: address(this),
            risky: risky,
            stable: stable,
            scaleFactorRisky: scaleFactorRisky,
            scaleFactorStable: scaleFactorStable,
            minLiquidity: minLiquidity
        }); // Engines call this to get constructor args
        engine = address(new MockEngine{salt: keccak256(abi.encode(risky, stable))}());
        getEngine[risky][stable] = engine;
        emit DeployEngine(msg.sender, risky, stable, engine);
        delete args;
    }
}
