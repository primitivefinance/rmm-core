// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Action functions for the Primitive Engine contract
/// @author Primitive
interface IPrimitiveEngineActions {
    // ===== Pool Updates =====

    /// @notice             Updates the time until expiry of the pool by setting its last timestamp value
    /// @param  poolId      Pool Identifier
    /// @return lastTimestamp Timestamp loaded into the state of the pool's Calibration.lastTimestamp
    function updateLastTimestamp(bytes32 poolId) external returns (uint32 lastTimestamp);

    /// @notice             Initializes a curve with parameters in the `settings` storage mapping in the Engine
    /// @param  strike      Strike price of the pool to calibrate to, wei value with 18 decimals of precision
    /// @param  sigma       Volatility to calibrate to as an unsigned 256-bit integer w/ precision of 1e4, 10000 = 100%
    /// @param  maturity    Maturity timestamp of the pool, in seconds
    /// @param  delta       N(d1), d1 = (ln(S / K) + (r * sigma^2 / 2) ) / sigma * sqrt(tau), 0 < delta < 1e18
    /// @param  delLiquidity Amount of liquidity to allocate to the curve, wei value with 18 decimals of precision
    /// @param  data        Arbitrary data that is passed to the createCallback function
    /// @return poolId      Pool Identifier
    /// delRisky            Amount of risky tokens provided to reserves
    /// delStable           Amount of stable tokens provided to reserves
    function create(
        uint256 strike,
        uint64 sigma,
        uint32 maturity,
        uint256 delta,
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
    /// @param  poolId      Pool Identifier
    /// @param  recipient   Address to give the allocated liquidity to
    /// @param  delLiquidity  Quantity of liquidity units to allocate
    /// @param  fromMargin  Whether the `msg.sender` pays with their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the allocateCallback function
    /// @return delRisky    Amount of risky tokens allocated
    /// delStable           Amount of stable tokens allocated
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 delRisky, uint256 delStable);

    /// @notice             Unallocates risky and stable tokens from a specific curve with `poolId`
    /// @param  poolId      Pool Identifier
    /// @param  delLiquidity Amount of liquidity to burn to release tokens
    /// @return delRisky    Amount of risky tokens received from removed liquidity
    /// delStable           Amount of stable tokens received from removed liquidity
    function remove(bytes32 poolId, uint256 delLiquidity) external returns (uint256 delRisky, uint256 delStable);

    // ===== Swaps =====

    /// @notice             Swaps between `risky` and `stable` assets
    /// @param  poolId      Pool Identifier
    /// @param  riskyForStable If true, swap risky to stable tokens, else swap stable to risky tokens
    /// @param  deltaIn     Amount of tokens to swap in
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  toMargin    Proceeds from swap goes to margin or not
    /// @param  data        Arbitrary data that is passed to the swapCallback function
    /// @return deltaOut    Amount of either stable or risky tokens that were sent out of this contract as payment
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) external returns (uint256 deltaOut);
}
