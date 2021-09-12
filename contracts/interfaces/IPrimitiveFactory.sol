// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Primitive Factory interface
/// @author  Primitive

interface IPrimitiveFactory {
    /// @notice         Created a new engine contract!
    /// @param  from    Calling `msg.sender` of deploy
    /// @param  risky   Risky token of Engine to deploy
    /// @param  stable  Stable token of Engine to deploy
    /// @param  engine  Deployed engine address
    event Deployed(address indexed from, address indexed risky, address indexed stable, address engine);

    /// @notice         Deploys a new Engine contract and sets the `getEngine` mapping for the tokens
    /// @param  risky   Risky token, the underlying token
    /// @param  stable  Stable token, the quote token
    function deploy(address risky, address stable) external returns (address engine);

    // ===== View =====

    /// @notice         Used to scale the minimum amount of liquidity to lowest precision
    /// @dev            E.g. if the lowest decimal token is 6, min liquidity w/ 18 decimals
    ///                 cannot be 1000 wei, therefore the token decimals
    ///                 divided by the min liquidity factor is the amount of minimum liquidity
    ///                 MIN_LIQUIDITY = 10 ^ (Decimals / MIN_LIQUIDITY_FACTOR)
    function MIN_LIQUIDITY_FACTOR() external pure returns (uint256);

    /// @notice         Called within Engine constructor so Engine can set immutable variables without constructor args
    /// @return factory Smart contract deploying the Engine contract
    /// risky           Risky token
    /// stable          Stable token
    /// scaleFactorRisky  Scale factor of the risky token, 10^(18 - riskyTokenDecimals)
    /// scaleFactorStable Scale factor of the stable token, 10^(18 - stableTokenDecimals)
    /// minLiquidity    Minimum amount of liquidity on pool creation
    function args()
        external
        view
        returns (
            address factory,
            address risky,
            address stable,
            uint256 scaleFactorRisky,
            uint256 scaleFactorStable,
            uint256 minLiquidity
        );

    /// @notice         Fetches engine address of a token pair
    /// @param risky    Risky token, the underlying token
    /// @param stable   Stable token, the quote token
    /// @return engine  Engine address for a risky and stable token
    function getEngine(address risky, address stable) external view returns (address engine);

    /// @notice         Owner does not have any access controls to wield
    /// @return         Controlling address of this factory contract
    function owner() external view returns (address);
}
