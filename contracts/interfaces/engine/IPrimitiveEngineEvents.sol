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

    // ===== Convexity =====
    /// @notice             Liquidity shares added to the float to be borrowed
    /// @param  from        Calling `msg.sender`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity shares supplied
    event Supplied(address indexed from, bytes32 indexed poolId, uint256 delLiquidity);

    /// @notice             Liquidity shares removed from the float
    /// @param  from        Calling `msg.sender`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity shares removed from the float
    event Claimed(address indexed from, bytes32 indexed poolId, uint256 delLiquidity);

    /// @notice             Adds liquidity shares to a `recipient`'s position while adding an equal amount of debt
    /// @param  recipient   Owner of the position which receives liquidity shares
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity shares borrowed, and added as debt
    /// @param  premium     Amount of risky added from margin or external transfer
    event Borrowed(address indexed recipient, bytes32 indexed poolId, uint256 delLiquidity, uint256 premium);

    /// @notice             Repays a borrowed position, reduces liquidity shares of position and debt
    /// @param  from        Calling `msg.sender`
    /// @param  recipient   Owner of the position to repay
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  riskyAmount Amount of risky tokens that was sent (negative) or requested (positive)
    /// @param  stableAmount Amount of stable tokens that was sent (negative) or requested (positive)
    event Repaid(
        address indexed from,
        address indexed recipient,
        bytes32 indexed poolId,
        int256 riskyAmount,
        int256 stableAmount
    );
}
