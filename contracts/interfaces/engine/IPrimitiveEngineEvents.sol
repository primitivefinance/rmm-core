// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Events of the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineEvents {
    /// @notice             Creates a new calibrated curve with liquidity
    /// @param  from        Calling `msg.sender` of the create function
    /// @param  strike      Strike price of the option of the curve to calibrate to
    /// @param  sigma       Volatility of the option of the curve to calibrate to
    /// @param  maturity    Maturity timestamp of the option of the curve to calibrate to
    event Created(address indexed from, uint256 indexed strike, uint256 sigma, uint256 indexed maturity);

    /// @notice             Updates the time until expiry of the option with `poolId`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  timestamp   New current timestamp to calculate the time until expiry with
    event UpdatedTimestamp(bytes32 indexed poolId, uint32 indexed timestamp);

    // ===== Margin ====
    /// @notice             Added stable and/or risky tokens to a margin accouynt
    /// @param  from        Calling `msg.sender`
    /// @param  recipient   Margin account recieving deposits
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Deposited(address indexed from, address indexed recipient, uint256 delRisky, uint256 delStable);

    /// @notice             Removes stable and/or risky from a margin account
    /// @param  from        Calling `msg.sender`
    /// @param  recipient   Address that tokens are sent to
    /// @param  delRisky    Amount of risky tokens withdrawn
    /// @param  delStable   Amount of stable tokens withdrawn
    event Withdrawn(address indexed from, address indexed recipient, uint256 delRisky, uint256 delStable);

    // ===== Liquidity =====
    /// @notice             Adds liquidity of risky and stable tokens to a specified curve `poolId`
    /// @param  from        Calling `msg.sender`
    /// @param  recipient   Address that controls the position
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Allocated(
        address indexed from,
        address indexed recipient,
        bytes32 indexed poolId,
        uint256 delRisky,
        uint256 delStable
    );

    /// @notice             Adds liquidity of risky and stable tokens to a specified curve `poolId`
    /// @param  from        Calling `msg.sender`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Removed(address indexed from, bytes32 indexed poolId, uint256 delRisky, uint256 delStable);

    // ===== Swaps =====
    /// @notice             Swaps either risky for stable tokens or stable for risky.
    /// @param  from        Calling `msg.sender`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  riskyForStable  If true, a swap from the risky token to the stable token
    /// @param  deltaIn     Amount of tokens paid
    /// @param  deltaOut    Amount of tokens received
    event Swap(
        address indexed from,
        bytes32 indexed poolId,
        bool indexed riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut
    );
}
