// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Action functions for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineActions {
    /// @notice             Initializes a curve with parameters in the `settings` storage mapping in the Engine
    /// @param  strike      Strike price of the option to calibrate to
    /// @param  sigma       Volatility of the option to calibrate to
    /// @param  maturity    Maturity timestamp of the option
    /// @param  delta       Call option delta, change in option value wrt to a 1% change in underlying value
    /// @param  delLiquidity Amount of liquidity to allocate to the curve
    /// @param  data        Arbitrary data that is passed to the createCallback function
    /// @return poolId      Keccak256 hash of the parameters (engine, strike, sigma, and maturity)
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
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  recipient   Address to give the allocated position to
    /// @param  delLiquidity  Quantity of liquidity units to get allocated
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the allocateCallback function
    /// @return delRisky    Amount of risky tokens that were allocated
    /// delStable           Amount of stable tokens that were allocated
    function allocate(
        bytes32 poolId,
        address recipient,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256, uint256);

    /// @notice             Unallocates risky and stable tokens from a specific curve with `poolId`
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity to burn to release tokens
    /// @return delRisky    Amount of risky tokens received from the burned liquidity
    /// delStable           Amount of stable tokens received from the burned liquidity
    function remove(bytes32 poolId, uint256 delLiquidity) external returns (uint256 delRisky, uint256 delStable);

    // ===== Swaps =====
    /// @notice             Swaps risky or stable tokens
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  riskyForStable Whether to do a risky to stable token swap, or stable to risky swap
    /// @param  deltaIn     Amount of tokens to swap in
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the swapCallback function
    /// @return deltaOut    Amount of either stable or risky tokens that were sent out of this contract as payment
    function swap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 deltaIn,
        bool fromMargin,
        bytes calldata data
    ) external returns (uint256 deltaOut);

    // ===== Convexity =====
    /// @notice             Supplies liquidity to be borrowed
    /// @dev                Increases the `msg.sender`'s position's float value.
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity to add to the float
    function supply(bytes32 poolId, uint256 delLiquidity) external;

    /// @notice             Removes supplied liquidity.
    /// @dev                Reduces the `msg.sender`'s position's float value.
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  delLiquidity Amount of liquidity to remove from the float
    function claim(bytes32 poolId, uint256 delLiquidity) external;

    /// @notice             Borrows liquidity and removes it, adding a debt
    /// @dev                Increases the `msg.sender`'s position's liquidity value and adds the same to the debt
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param riskyCollateral  Amount of risky to hold as collateral, for risky / 1 = units of debt
    /// @param stableCollateral Amount of stable to hold as collateral, for stable / K = units of debt, K = strike
    /// @param  fromMargin  Use margin risky balance to pay premium?
    /// @param  data        Arbitrary data that is passed to the borrowCallback function
    /// @return delRisky    Amount of risky tokens removed from liquidity borrowed
    /// delStable           Amount of stable tokens removed from liquidity borrowed
    /// riskyDeficit        Price paid in risky to open position
    /// stableDeficit       Price paid in stable to open position
    function borrow(
        bytes32 poolId,
        uint256 riskyCollateral,
        uint256 stableCollateral,
        bool fromMargin,
        bytes calldata data
    )
        external
        returns (
            uint256 delRisky,
            uint256 delStable,
            uint256 riskyDeficit,
            uint256 stableDeficit
        );

    /// @notice             Pays back liquidity share debt by allocating liquidity
    /// @dev                Reduces the `msg.sender`'s position's liquidity value and reduces the same to the debt value
    /// @param  poolId      Keccak hash of the option parameters of a curve to interact with
    /// @param  recipient   Position recipient to grant the borrowed liquidity shares
    /// @param  riskyToLiquidate  Amount of risky collateral to liquidate by repaying, for risky / 1 = units of debt
    /// @param  stableToLiquidate Amount of stable collateral to liquidate by repaying, for stable / K = units of debt
    /// @param  fromMargin  Whether the `msg.sender` uses their margin balance, or must send tokens
    /// @param  data        Arbitrary data that is passed to the repayCallback function
    /// @return riskyAmount        Price paid in risky to the `recipient`'s margin account
    /// stableAmount       Price paid in stable to the `recipient`'s margin account
    function repay(
        bytes32 poolId,
        address recipient,
        uint256 riskyToLiquidate,
        uint256 stableToLiquidate,
        bool fromMargin,
        bytes calldata data
    ) external returns (int256 riskyAmount, int256 stableAmount);
}
