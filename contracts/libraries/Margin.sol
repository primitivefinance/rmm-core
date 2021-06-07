// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Margin Library
/// @author  Primitive
/// @dev     This library is a generalized margin position data structure for any engine.

library Margin {
    // every margin position in an Engine is this data structure.
    struct Data {
        // Balance of X, the RISKY, or underlying asset.
        uint BX1;
        // Balance of Y, the RISK-FREE, or "quote" asset, a stablecoin.
        uint BY2;
        // Transiently set as true when a margin position is being edited.
        bool unlocked;
    }

    /// @notice  An Engine's mapping of margin position Ids to Data structs can be used to fetch any margin position.
    /// @dev     Used across all Engines.
    /// @param   mar The margin data mapping to fetch the owner of
    /// @param   owner The margin account owner
    function fetch(
        mapping(address => Data) storage mar,
        address owner
    ) internal view returns (Data storage) {
        return mar[owner];
    }

    /// @notice Adds to risky and riskless token balances
    /// @param  mar     The margin data in storage to manipulate
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function deposit(Data storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        if(deltaX > 0) mar.BX1 += deltaX;
        if(deltaY > 0) mar.BY2 += deltaY;
        return mar;
    }

    /// @notice Removes risky and riskless token balance from `msg.sender`'s internal margin account
    /// @param  mar     The margin data mapping which is used with `msg.sender` to get a margin account
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function withdraw(mapping(address => Data) storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        Data storage margin = mar[msg.sender];
        if(deltaX > 0) margin.BX1 -= deltaX;
        if(deltaY > 0) margin.BY2 -= deltaY;
        return margin;
    }
}
