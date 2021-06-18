// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The action functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineActions {
    // Curve

    /// @notice Initializes a curve with parameters in the `settings` storage mapping in the Engine
    /// @param  strike The strike price of the option to calibrate to
    /// @param  sigma  The volatility of the option to calibrate to
    /// @param  time   The time until expiry of the option to calibrate to
    /// @param  riskyPrice  The amount of stable tokens required to purchase 1 unit of the risky token, spot price
    /// @param  delLiquidity Amount of liquidity to initialize the pool with
    /// @param  data    Arbitrary data that is passed to the createCallback function
    /// @return pid The keccak256 hash of the parameters strike, sigma, and time, use to identify this option
    function create(
        uint256 strike,
        uint256 sigma,
        uint256 time,
        uint256 riskyPrice,
        uint256 delLiquidity,
        bytes calldata data
    ) external returns (bytes32 pid);

    // Margin

    /// @notice Adds risky and/or stable tokens to a `msg.sender`'s internal balance account
    /// @param  owner   The recipient margin account of the deposited tokens
    /// @param  delRisky  The amount of risky tokens to deposit
    /// @param  delStable  The amount of stable tokens to deposit
    /// @param  data    Arbitrary data that is passed to the depositCallback function
    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;

    /// @notice Removes risky and/or stable tokens from a `msg.sender`'s internal balance account
    /// @param  delRisky  The amount of risky tokens to withdraw
    /// @param  delStable  The amount of stable tokens to withdraw
    function withdraw(uint256 delRisky, uint256 delStable) external;

    // Liquidity

    /// @notice Allocates risky and stable tokens to a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The address to give the allocated position to
    /// @param  delLiquidity  The quantity of liquidity units to get allocated
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data    Arbitrary data that is passed to the allocateCallback function
    /// @return delRisky  The amount of risky tokens that were allocated
    /// delStable  The amount of stable tokens that were allocated
    function allocate(
        bytes32 pid,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);

    /// @notice Unallocates risky and stable tokens from a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity  Amount of liquidity to burn to release tokens
    /// @param  fromMargin Deposit tokens to `msg.sender`'s margin account
    /// @param  data    Arbitrary data that is passed to the removeCallback function
    /// @return delRisky  Amount of risky tokens received from the burned liquidity
    /// delStable          Amount of stable tokens received from the burned liquidity
    function remove(
        bytes32 pid,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 delRisky, uint256 delStable);

    // Swaps

    /// @notice Swaps risky or stable tokens
    /// @param  pid         The keccak hash of the option parameters of a curve to interact with
    /// @param  addXRemoveY Whether to do a risky to stable token swap, or stable to risky swap
    /// @param  deltaOut    The amount of requested tokens that are swapped to
    /// @param  deltaInMax  The max amount of tokens paid for the swap
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the swapCallback function
    /// @return deltaIn     Amount of either stable or risky tokens that were sent into this contract as payment
    function swap(
        bytes32 pid,
        bool addXRemoveY,
        uint256 deltaOut,
        uint256 deltaInMax,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 deltaIn);

    // Lending

    /// @notice Increases the `msg.sender`'s position's float value. Lends liquidity.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity  The amount of liquidity to add to the float
    function lend(bytes32 pid, uint256 delLiquidity) external;

    /// @notice Reduces the `msg.sender`'s position's float value. Removes loaned liquidity.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity  The amount of liquidity to remove from the float
    function claim(bytes32 pid, uint256 delLiquidity) external;

    /// @notice Increases the `msg.sender`'s position's liquidity value and also adds the same to the debt value.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  delLiquidity  The amount of liquidity to borrow and add as debt
    /// @param  maxPremium  The max amount of `premium` that can be collected from the `msg.sender` to collateralize the position
    /// @param  data    Arbitrary data that is passed to the borrowCallback function
    function borrow(
        bytes32 pid,
        address owner,
        uint256 delLiquidity,
        uint256 maxPremium,
        bytes calldata data
    ) external;

    /// @notice Reduces the `msg.sender`'s position's liquidity value and also reduces the same to the debt value.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  delLiquidity  The amount of liquidity to borrow and add as debt
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data    Arbitrary data that is passed to the repayCallback function
    function repay(
        bytes32 pid,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);
}
