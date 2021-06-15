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
    /// @param  dLiquidity Amount of liquidity to initialize the pool with
    /// @param  data    Arbitrary data that is passed to the createCallback function
    /// @return pid The keccak256 hash of the parameters strike, sigma, and time, use to identify this option
    function create(
        uint256 strike,
        uint256 sigma,
        uint256 time,
        uint256 riskyPrice,
        uint256 dLiquidity,
        bytes calldata data
    ) external returns (bytes32 pid);

    // Margin

    /// @notice Adds risky and/or stable tokens to a `msg.sender`'s internal balance account
    /// @param  owner   The recipient margin account of the deposited tokens
    /// @param  deltaX  The amount of risky tokens to deposit
    /// @param  deltaY  The amount of stable tokens to deposit
    /// @param  data    Arbitrary data that is passed to the depositCallback function
    function deposit(
        address owner,
        uint256 deltaX,
        uint256 deltaY,
        bytes calldata data
    ) external;

    /// @notice Removes risky and/or stable tokens from a `msg.sender`'s internal balance account
    /// @param  deltaX  The amount of risky tokens to withdraw
    /// @param  deltaY  The amount of stable tokens to withdraw
    function withdraw(uint256 deltaX, uint256 deltaY) external;

    // Liquidity

    /// @notice Allocates risky and stable tokens to a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The address to give the allocated position to
    /// @param  deltaL  The quantity of liquidity units to get allocated
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data    Arbitrary data that is passed to the allocateCallback function
    /// @return deltaX  The amount of risky tokens that were allocated
    /// deltaY  The amount of stable tokens that were allocated
    function allocate(
        bytes32 pid,
        address owner,
        uint256 deltaL,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);

    /// @notice Unallocates risky and stable tokens from a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  deltaL  Amount of liquidity to burn to release tokens
    /// @param  fromMargin Deposit tokens to `msg.sender`'s margin account
    /// @param  data    Arbitrary data that is passed to the removeCallback function
    /// @return deltaX  Amount of risky tokens received from the burned liquidity
    /// deltaY          Amount of stable tokens received from the burned liquidity
    function remove(
        bytes32 pid,
        uint256 deltaL,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 deltaX, uint256 deltaY);

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
    /// @param  deltaL  The amount of liquidity to add to the float
    function lend(bytes32 pid, uint256 deltaL) external;

    /// @notice Reduces the `msg.sender`'s position's float value. Removes loaned liquidity.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  deltaL  The amount of liquidity to remove from the float
    function claim(bytes32 pid, uint256 deltaL) external;

    /// @notice Increases the `msg.sender`'s position's liquidity value and also adds the same to the debt value.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  deltaL  The amount of liquidity to borrow and add as debt
    /// @param  maxPremium  The max amount of `premium` that can be collected from the `msg.sender` to collateralize the position
    /// @param  data    Arbitrary data that is passed to the borrowCallback function
    function borrow(
        bytes32 pid,
        address owner,
        uint256 deltaL,
        uint256 maxPremium,
        bytes calldata data
    ) external;

    /// @notice Reduces the `msg.sender`'s position's liquidity value and also reduces the same to the debt value.
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  deltaL  The amount of liquidity to borrow and add as debt
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data    Arbitrary data that is passed to the repayCallback function
    function repay(
        bytes32 pid,
        address owner,
        uint256 deltaL,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);
}
