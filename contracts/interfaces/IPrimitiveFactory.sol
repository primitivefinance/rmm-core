// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Primitive Factory interface
/// @author  Primitive

interface IPrimitiveFactory {
    /// @notice Created a new engine contract!
    /// @param  from    Calling `msg.sender`
    /// @param  risky   Risky token
    /// @param  stable  Stable token
    /// @param  engine  Deployed engine address
    event EngineCreated(address indexed from, address indexed risky, address indexed stable, address engine);

    /// @notice Deploys a new Engine contract and sets the `getEngine` mapping for the tokens
    /// @param  risky   Risky token address, not a stable asset! But what is?
    /// @param  stable  Stable token address, like Dai or Fei or Rai. If your stablecoin isn't 3 letters I'm not using it
    function create(address risky, address stable) external returns (address engine);

    // ===== View =====

    /// @notice Transiently set so the Engine can set immutable variables without constructor args
    /// @return factory Smart contract deploying the Engine contract
    /// risky   Risky token
    /// stable  Stable token
    function args()
        external
        view
        returns (
            address factory,
            address risky,
            address stable
        );

    /// @return engine Engine address for a risky and stable token
    function getEngine(address risky, address stable) external view returns (address engine);

    /// @return Controlling address of this factory contract
    function owner() external view returns (address);
}
