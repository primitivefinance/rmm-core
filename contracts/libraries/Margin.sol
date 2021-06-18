// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Margin Library
/// @author  Primitive
/// @dev     Uses a data struct with two uint128s to optimize for one storage slot.

import "./SafeCast.sol";

library Margin {
    using SafeCast for uint256;

    // Every margin position in an Engine has this data structure, optimized for 1 storage slot.
    struct Data {
        uint128 balanceRisky; // Balance of the RISKY, aka underlying asset.
        uint128 balanceStable; // Balance of the STABLE, aka "quote" asset, a stablecoin.
    }

    /// @notice Adds to risky and stable token balances
    /// @param  mar     The margin data in storage to manipulate
    /// @param  delRisky  The amount of risky tokens to add to margin
    /// @param  delStable  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function deposit(
        Data storage mar,
        uint256 delRisky,
        uint256 delStable
    ) internal returns (Data storage) {
        if (delRisky > 0) mar.balanceRisky += delRisky.toUint128();
        if (delStable > 0) mar.balanceStable += delStable.toUint128();
        return mar;
    }

    /// @notice Removes risky and stable token balance from `msg.sender`'s internal margin account
    /// @param  mar     The margin data mapping which is used with `msg.sender` to get a margin account
    /// @param  delRisky  The amount of risky tokens to add to margin
    /// @param  delStable  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function withdraw(
        mapping(address => Data) storage mar,
        uint256 delRisky,
        uint256 delStable
    ) internal returns (Data storage) {
        Data storage margin = mar[msg.sender];
        if (delRisky > 0) margin.balanceRisky -= delRisky.toUint128();
        if (delStable > 0) margin.balanceStable -= delStable.toUint128();
        return margin;
    }
}
