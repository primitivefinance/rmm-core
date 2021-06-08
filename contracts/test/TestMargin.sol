// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../libraries/Margin.sol";

/// @title   Margin Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestMargin {
    using Margin for Margin.Data;
    using Margin for mapping(address => Margin.Data);

    /// @notice Storage slot used for testing
    Margin.Data public margin;
    /// @notice Mapping used for testing
    mapping(address => Margin.Data) public margins;

    modifier useRef(address owner) {
        margin = margins[owner];
        _;
    }

    /// @notice Adds to risky and riskless token balances
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function shouldDeposit(uint deltaX, uint deltaY) public useRef(msg.sender) returns (Margin.Data memory) {
        uint preX = uint(margin.balanceRisky);
        uint preY = uint(margin.balanceStable);
        margin.deposit(deltaX, deltaY);
        assert(preX + deltaX >= uint(margin.balanceRisky));
        assert(preY + deltaY >= uint(margin.balanceStable));
        return margin;
    }

    /// @notice Removes risky and riskless token balance from `msg.sender`'s internal margin account
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function shouldWithdraw(uint deltaX, uint deltaY) public returns (Margin.Data memory) {
        uint preX = uint(margin.balanceRisky);
        uint preY = uint(margin.balanceStable);
        margin = margins.withdraw(deltaX, deltaY);
        assert(preX - deltaX >= uint(margin.balanceRisky));
        assert(preY - deltaY >= uint(margin.balanceStable));
        return margin;
    }
}