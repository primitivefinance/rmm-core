// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/Margin.sol";

/// @title   Margin Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestMargin {
    using Margin for Margin.Data;
    using Margin for mapping(address => Margin.Data);

    /// @notice Mapping used for testing
    mapping(address => Margin.Data) public margins;

    function margin() public view returns (Margin.Data memory) {
        return margins[msg.sender];
    }

    /// @notice Adds to risky and riskless token balances
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function shouldDeposit(uint256 deltaX, uint256 deltaY) public returns (Margin.Data memory) {
        uint128 preX = margins[msg.sender].balanceRisky;
        uint128 preY = margins[msg.sender].balanceStable;
        margins[msg.sender].deposit(deltaX, deltaY);
        assert(preX + deltaX >= margins[msg.sender].balanceRisky);
        assert(preY + deltaY >= margins[msg.sender].balanceStable);
        return margins[msg.sender];
    }

    /// @notice Removes risky and riskless token balance from `msg.sender`'s internal margin account
    /// @param  deltaX  The amount of risky tokens to add to margin
    /// @param  deltaY  The amount of stable tokens to add to margin
    /// @return The margin data storage item
    function shouldWithdraw(uint256 deltaX, uint256 deltaY) public returns (Margin.Data memory) {
        uint128 preX = margins[msg.sender].balanceRisky;
        uint128 preY = margins[msg.sender].balanceStable;
        margins[msg.sender] = margins.withdraw(deltaX, deltaY);
        assert(preX - deltaX >= margins[msg.sender].balanceRisky);
        assert(preY - deltaY >= margins[msg.sender].balanceStable);
        return margins[msg.sender];
    }
}
