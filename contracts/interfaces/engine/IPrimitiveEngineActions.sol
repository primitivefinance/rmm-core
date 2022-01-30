// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.5.0;

/// @title  Action functions for the Primitive Engine contract
/// @author Primitive
interface IPrimitiveEngineActions {
    // ===== Pool Updates =====

    /// @notice             Updates the time until expiry of the pool by setting its last timestamp value
    /// @param  poolId      Keccak256 hash of engine address, strike, sigma, maturity, and gamma
    /// @return lastTimestamp Timestamp loaded into the state of the pool's Calibration.lastTimestamp
    function updateLastTimestamp(bytes32 poolId) external returns (uint32 lastTimestamp);

    /// @notice             Initializes a curve with parameters in the `calibrations` storage mapping in the Engine
    /// @param  strike      Marginal price of the pool's risky token at maturity, with the same decimals as the stable token, valid [0, 2^128-1]
    /// @param  sigma       AKA Implied Volatility in basis points, determines the price impact of swaps, valid for (1, 10_000_000)
    /// @param  maturity    Timestamp which starts the BUFFER countdown until swaps will cease, in seconds, valid for (block.timestamp, 2^32-1]
    /// @param  gamma       Multiplied against swap in amounts to apply fee, equal to 1 - fee % but units are in basis points, valid for (9_000, 10_000)
    /// @param  riskyPerLp  Risky reserve per liq. with risky decimals, = 1 - N(d1), d1 = (ln(S/K)+(r*σ^2/2))/σ√τ, valid for [0, 1e^(risky token decimals))
    /// @param  delLiquidity Amount of liquidity units to allocate to the curve, wei value with 18 decimals of precision
    /// @param  data        Arbitrary data that is passed to the createCallback function
    /// @return poolId      Keccak256 hash of engine address, strike, sigma, maturity, and gamma
    /// @return delRisky    Total amount of risky tokens provided to reserves
    /// @return delStable   Total amount of stable tokens provided to reserves
    function create(
        uint128 strike,
        uint32 sigma,
        uint32 maturity,
        uint32 gamma,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes calldata data
    )
        external
        returns (
            bytes32 poolId,
            uint256 delRisky,
            uint256 delStable
        );

    // ===== Margin ====

    /// @notice             Adds risky and/or stable tokens to a `recipient`'s internal balance account
    /// @param  recipient   Recipient margin account of the deposited tokens
    /// @param  delRisky    Amount of risky tokens to deposit
    /// @param  delStable   Amount of stable tokens to deposit
    /// @param  data        Arbitrary data that is passed to the depositCallback function
    function deposit(
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;

    /// @notice             Removes risky and/or stable tokens from a `msg.sender`'s internal balance account
    /// @param  recipient   Address that tokens are transferred to
    /// @param  delRisky    Amount of risky tokens to withdraw
    /// @param  delStable   Amount of stable tokens to withdraw
    function withdraw(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) external;

    // ===== Liquidity =====

    /// @notice             Allocates risky and stable tokens to a specific curve with `poolId`
    /// @param  poolId      Keccak256 hash of engine address, strike, sigma, maturity, and gamma
    /// @param  recipient   Address to give the allocated liquidity to
    /// @param  delRisky    Amount of risky tokens to add
    /// @param  delStable   Amount of stable tokens to add
    /// @param  fromMargin  Whether the `msg.sender` pays with their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the allocateCallback function
    /// @return delLiquidity Amount of liquidity given to `recipient`
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delRisky,
        uint256 delStable,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 delLiquidity);

    /// @notice               Unallocates risky and stable tokens from a specific curve with `poolId`
    /// @param  poolId        Keccak256 hash of engine address, strike, sigma, maturity, and gamma
    /// @param  delLiquidity  Amount of liquidity to remove
    /// @return delRisky      Amount of risky tokens received from removed liquidity
    /// @return delStable     Amount of stable tokens received from removed liquidity
    function remove(bytes32 poolId, uint256 delLiquidity) external returns (uint256 delRisky, uint256 delStable);

    // ===== Swaps =====

    /// @notice             Swaps between `risky` and `stable` tokens
    /// @param  recipient   Address that receives output token `deltaOut` amount
    /// @param  poolId      Keccak256 hash of engine address, strike, sigma, maturity, and gamma
    /// @param  riskyForStable If true, swap risky to stable, else swap stable to risky
    /// @param  deltaIn     Amount of tokens to swap in
    /// @param  deltaOut    Amount of tokens to swap out
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  toMargin    Whether the `deltaOut` amount is transferred or deposited into margin
    /// @param  data        Arbitrary data that is passed to the swapCallback function
    function swap(
        address recipient,
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) external;
}
