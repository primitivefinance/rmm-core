// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title  The events for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineEvents {
    /// @notice Creates a new calibrated curve and initialized its liquidity
    /// @param  from    Calling `msg.sender` of the create function
    /// @param  strike  Strike price of the option of the curve to calibrate to
    /// @param  sigma   Volatility of the option of the curve to calibrate to
    /// @param  time    Time until expiry of the option of the curve to calibrate to
    event Created(address indexed from, uint256 indexed strike, uint256 sigma, uint256 indexed time);

    // ===== Margin ====
    /// @notice Added stable and/or risky tokens to a margin accouynt
    /// @param  from        Calling `msg.sender`
    /// @param  owner       Recipient margin account owner
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Deposited(address indexed from, address indexed owner, uint256 delRisky, uint256 delStable);

    /// @notice Removes stable and/or risky from a margin account
    /// @param  from        Calling `msg.sender`
    /// @param  delRisky    Amount of risky tokens withdrawn
    /// @param  delStable   Amount of stable tokens withdrawn
    event Withdrawn(address indexed from, uint256 delRisky, uint256 delStable);

    // ===== Liquidity =====
    /// @notice Adds liquidity of risky and stable tokens to a specified curve `poolId`
    /// @param  from        Calling `msg.sender`
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Allocated(address indexed from, uint256 delRisky, uint256 delStable);

    /// @notice Adds liquidity of risky and stable tokens to a specified curve `poolId`
    /// @param  from        Calling `msg.sender`
    /// @param  delRisky    Amount of risky tokens deposited
    /// @param  delStable   Amount of stable tokens deposited
    event Removed(address indexed from, uint256 delRisky, uint256 delStable);

    // ===== Swaps =====
    /// @notice Swaps either risky for stable tokens or stable for risky.
    /// @param  from     Calling `msg.sender`
    /// @param  poolId   Keccak hash of the option parameters of a curve to interact with
    /// @param  addXRemoveY  If true, a swap from the risky token to the stable token
    /// @param  deltaIn  Amount of tokens paid
    /// @param  deltaOut Amount of tokens received
    event Swap(
        address indexed from,
        bytes32 indexed poolId,
        bool indexed addXRemoveY,
        uint256 deltaIn,
        uint256 deltaOut
    );

    // ===== Lending =====
    /// @notice Liquidity shares added to the float to be borrowed
    /// @param  from            Calling `msg.sender`
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity shares loaned
    event Loaned(address indexed from, bytes32 indexed poolId, uint256 delLiquidity);

    /// @notice Liquidity shares removed from the float
    /// @param  from            Calling `msg.sender`
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity shares removed from the float
    event Claimed(address indexed from, bytes32 indexed poolId, uint256 delLiquidity);

    /// @notice Adds liqidity shares to a `recipient`'s position while adding an equal amount of debt
    /// @param  recipient       Owner of the position which receives liquidity shares
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity shares borrowed, and added as debt
    /// @param  maxPremium      Maximum amount of risky tokens to pay as a `premium` to collateralize the position
    event Borrowed(address indexed recipient, bytes32 indexed poolId, uint256 delLiquidity, uint256 maxPremium);

    /// @notice Repays a borrowed position, reduces liquidity shares of position and debt.
    /// @param  owner           Owner of the position to repay
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity to pay
    event Repaid(address indexed owner, bytes32 indexed poolId, uint256 delLiquidity);

    // ===== Flash =====
    /// @notice Optimistically sends risky and/or stable tokens out of the contract, and expects them to be paid back
    /// @dev    https://eips.ethereum.org/EIPS/eip-3156
    event Flash(address indexed from, address indexed receiver, address indexed token, uint256 amount, uint256 payment);
}
