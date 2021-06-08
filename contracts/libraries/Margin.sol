// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Margin Library
/// @author  Primitive
/// @dev     Uses a data struct with two uint128s to optimize for one storage slot.

library Margin {
    // Every margin position in an Engine has this data structure, optimized for 1 storage slot.
    struct Data {
        // Balance of the RISKY, aka underlying asset.
        uint128 riskyBalance;
        // Balance of the RISK-FREE, aka "quote" asset, a stablecoin.
        uint128 stableBalance;
    }

    /// @notice Adds to risky and riskless token balances
    /// @param  mar     The margin data in storage to manipulate
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function deposit(Data storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        if(deltaX > 0) mar.riskyBalance += uint128(deltaX);
        if(deltaY > 0) mar.stableBalance += uint128(deltaY);
        return mar;
    }

    /// @notice Removes risky and stable token balance from `msg.sender`'s internal margin account
    /// @param  mar     The margin data mapping which is used with `msg.sender` to get a margin account
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function withdraw(mapping(address => Data) storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        Data storage margin = mar[msg.sender];
        if(deltaX > 0) margin.riskyBalance -= uint128(deltaX);
        if(deltaY > 0) margin.stableBalance -= uint128(deltaY);
        return margin;
    }
}
