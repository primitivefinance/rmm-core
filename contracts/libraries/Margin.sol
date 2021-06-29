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
    /// @param  margin      Margin data in storage to manipulate
    /// @param  delRisky    Amount of risky tokens to add to margin
    /// @param  delStable   Amount of stable tokens to add to margin
    function deposit(
        Data storage margin,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        if (delRisky > 0) margin.balanceRisky += delRisky.toUint128();
        if (delStable > 0) margin.balanceStable += delStable.toUint128();
    }

    /// @notice Removes risky and stable token balance from `msg.sender`'s internal margin account
    /// @param  margins     The margin data mapping which is used with `msg.sender` to get a margin account
    /// @param  delRisky    The amount of risky tokens to add to margin
    /// @param  delStable   The amount of stable tokens to add to margin
    /// @return margin      Data storage of a margin account
    function withdraw(
        mapping(address => Data) storage margins,
        uint256 delRisky,
        uint256 delStable
    ) internal returns (Data storage margin) {
        margin = margins[msg.sender];
        if (delRisky > 0) margin.balanceRisky -= delRisky.toUint128();
        if (delStable > 0) margin.balanceStable -= delStable.toUint128();
    }
}
