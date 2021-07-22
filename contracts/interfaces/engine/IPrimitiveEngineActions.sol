// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  The action functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineActions {
    // Curve

    /// @notice         Initializes a curve with parameters in the `settings` storage mapping in the Engine
    /// @param  strike  Strike price of the option to calibrate to
    /// @param  sigma   Volatility of the option to calibrate to
    /// @param  time    Maturity timestamp of the option
    /// @param  riskyPrice  Amount of stable tokens required to purchase 1 unit of the risky token, spot price
    /// @param  delLiquidity Amount of liquidity to initialize the pool with
    /// @param  data    Arbitrary data that is passed to the createCallback function
    /// @return poolId  Keccak256 hash of the parameters strike, sigma, and time, use to identify this option
    /// delRisky        Amount of risky tokens provided to reserves
    /// delStable       Amount of stable tokens provided to reserves
    function create(
        uint256 strike,
        uint64 sigma,
        uint32 time,
        uint256 riskyPrice,
        uint256 delLiquidity,
        bytes calldata data
    )
        external
        returns (
            bytes32 poolId,
            uint256 delRisky,
            uint256 delStable
        );

    // Margin

    /// @notice Adds risky and/or stable tokens to a `msg.sender`'s internal balance account
    /// @param  owner       Recipient margin account of the deposited tokens
    /// @param  delRisky    Amount of risky tokens to deposit
    /// @param  delStable   Amount of stable tokens to deposit
    /// @param  data        Arbitrary data that is passed to the depositCallback function
    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external;

    /// @notice Removes risky and/or stable tokens from a `msg.sender`'s internal balance account
    /// @param  delRisky    Amount of risky tokens to withdraw
    /// @param  delStable   Amount of stable tokens to withdraw
    function withdraw(uint256 delRisky, uint256 delStable) external;

    // Liquidity

    /// @notice Allocates risky and stable tokens to a specific curve with `poolId`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  owner       Address to give the allocated position to
    /// @param  delLiquidity  Quantity of liquidity units to get allocated
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the allocateCallback function
    /// @return delRisky    Amount of risky tokens that were allocated
    /// delStable           Amount of stable tokens that were allocated
    function allocate(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);

    /// @notice Unallocates risky and stable tokens from a specific curve with `poolId`
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity to burn to release tokens
    /// @param  fromMargin      Deposit tokens to `msg.sender`'s margin account
    /// @param  data            Arbitrary data that is passed to the removeCallback function
    /// @return delRisky        Amount of risky tokens received from the burned liquidity
    /// delStable               Amount of stable tokens received from the burned liquidity
    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 delRisky, uint256 delStable);

    // Swaps

    /// @notice Swaps risky or stable tokens
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  riskyForStable Whether to do a risky to stable token swap, or stable to risky swap
    /// @param  deltaIn     Amount of tokens to swap
    /// @param  deltaOutMin Min amount of tokens to receive in exchange for `deltaIn` amount
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the swapCallback function
    /// @return deltaOut    Amount of either stable or risky tokens that were sent out of this contract as payment
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOutMin,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 deltaOut);

    // Lending

    /// @notice Increases the `msg.sender`'s position's float value. Lends liquidity.
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity to add to the float
    function lend(bytes32 poolId, uint256 delLiquidity) external;

    /// @notice Reduces the `msg.sender`'s position's float value. Removes loaned liquidity.
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity to remove from the float
    function claim(bytes32 poolId, uint256 delLiquidity) external;

    /// @notice Increases the `msg.sender`'s position's liquidity value and also adds the same to the debt value.
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity    Amount of liquidity to borrow and add as debt
    /// @param  maxPremium      Max amount of `premium` that can be collected from the `msg.sender` to collateralize the position
    /// @param  data            Arbitrary data that is passed to the borrowCallback function
    /// @return premium         Price paid to open position
    function borrow(
        bytes32 poolId,
        uint256 delLiquidity,
        uint256 maxPremium,
        bytes calldata data
    ) external returns (uint256 premium);

    /// @notice Reduces the `msg.sender`'s position's liquidity value and also reduces the same to the debt value.
    /// @param  poolId          Keccak hash of the option parameters of a curve to interact with
    /// @param  owner           Position owner to grant the borrowed liquidity shares
    /// @param  delLiquidity    Amount of liquidity to borrow and add as debt
    /// @param  fromMargin      Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data            Arbitrary data that is passed to the repayCallback function
    /// @return delRisky        Amount of risky tokens allocated as liquidity to pay debt
    /// delStable               Amount of stable tokens allocated as liquidity to pay debt
    /// premium                 Amount of risky tokens paid to the `owner`'s margin account
    function repay(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    )
        external
        returns (
            uint256 delRisky,
            uint256 delStable,
            uint256 premium
        );
}
