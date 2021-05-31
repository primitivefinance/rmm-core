// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The action functions for the Primitive Engine contract
/// @author Primitive

import "../../libraries/Calibration.sol";

interface IPrimitiveEngineActions {
    // Curve
    /// @notice Initializes a curve with parameters in the `settings` storage mapping in the Engine
    /// @param  strike The strike price of the option to calibrate to
    /// @param  sigma  The volatility of the option to calibrate to
    /// @param  time   The time until expiry of the option to calibrate to
    /// @param  riskyPrice  The amount of stable tokens required to purchase 1 unit of the risky token, spot price
    /// @return pid The keccak256 hash of the parameters strike, sigma, and time, use to identify this option
    function create(uint strike, uint sigma, uint time, uint riskyPrice) external returns (bytes32 pid);
    
    // Liquidity
    /// @notice Allocates risky and stable tokens to a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @param  owner   The address to give the allocated position to
    /// @param  deltaL  The quantity of liquidity units to get allocated
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @return deltaX  The amount of risky tokens that were allocated
    /// @return deltaY  The amount of stable tokens that were allocated
    function allocate(bytes32 pid, address owner, uint deltaL, bool fromMargin) external returns (uint, uint);

    /// @notice Unallocates risky and stable tokens from a specific curve with `pid`
    /// @param  pid     The keccak hash of the option parameters of a curve to interact with
    /// @return Documents the return variables of a contract’s function state variable
    function remove(bytes32 pid, uint deltaL, bool fromMargin) external returns (uint, uint);

    // Swaps
    /// @notice Swaps risky or stable tokens
    /// @param  pid         The keccak hash of the option parameters of a curve to interact with
    /// @param  addXRemoveY Whether to do a risky to stable token swap, or stable to risky swap
    /// @param  deltaOut    The amount of requested tokens that are swapped to
    /// @param  deltaInMax  The max amount of tokens paid for the swap
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @return deltaIn The amount of either stable or risky tokens that were sent into this contract as payment
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax, bool fromMargin) external returns (uint deltaIn);

    // Margin
    /// @notice Adds risky and/or stable tokens to a `msg.sender`'s internal balance account
    /// @param  owner   The recipient margin account of the deposited tokens
    /// @param  deltaX  The amount of risky tokens to deposit
    /// @param  deltaY  The amount of stable tokens to deposit
    /// @return Whether the deposit call was successful or not
    function deposit(address owner, uint deltaX, uint deltaY) external returns (bool);

    /// @notice Removes risky and/or stable tokens from a `msg.sender`'s internal balance account
    /// @param  deltaX  The amount of risky tokens to withdraw
    /// @param  deltaY  The amount of stable tokens to withdraw
    /// @return Whether the withdraw call was successful or not
    function withdraw(uint deltaX, uint deltaY) external returns (bool);

    // Lending
    /// @notice Increases the `msg.sender`'s position's float value. Lends liquidity.
    /// @param  pid
    /// @param  deltaL  The amount of liquidity to add to the float
    /// @return Whether the call was successful or not
    function lend(bytes32 pid, uint deltaL) external returns (bool);

    /// @notice Reduces the `msg.sender`'s position's float value. Removes loaned liquidity.
    /// @param  pid
    /// @param  deltaL  The amount of liquidity to remove from the float
    /// @return Whether the call was successful or not
    function claim(bytes32 pid, uint deltaL) external returns (bool);

    /// @notice Increases the `msg.sender`'s position's liquidity value and also adds the same to the debt value.
    /// @param  pid
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  deltaL  The amount of liquidity to borrow and add as debt
    /// @param  maxPremium  The max amount of `premium` that can be collected from the `msg.sender` to collateralize the position
    /// @return Whether the call was successful or not
    function borrow(bytes32 pid, address owner, uint deltaL, uint maxPremium) external returns (bool);

    /// @notice Reduces the `msg.sender`'s position's liquidity value and also reduces the same to the debt value.
    /// @param Documents a parameter just like in doxygen (must be followed by parameter name)
    /// @param  pid
    /// @param  owner   The position owner to grant the borrowed liquidity shares
    /// @param  deltaL  The amount of liquidity to borrow and add as debt
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @return Whether the call was successful or not
    function repay(bytes32 pid, address owner, uint deltaL, bool fromMargin) external returns (uint, uint);
}