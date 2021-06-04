// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../libraries/Reserve.sol";

/// @title   Reserve Lib API Test
/// @author  Primitive
/// @dev     For testing purposes ONLY

contract TestReserve {
    using Reserve for Reserve.Data;
    using Reserve for mapping(bytes32 => Reserve.Data);

    /// @notice Storage slot for reserve data to use for testing
    Reserve.Data public res;
    /// @notice All the reserve data structs to use for testing
    mapping(bytes32 => Reserve.Data) public reserves;

    /// @notice Uses to reference a reserve during the fn calls
    modifier useRef(bytes32 resId) {
        res = reserves[resId];
        _;
    }

    /// @return blockTimestamp The uint32 block.timestamp
    function shouldBlockTimestamp() public view returns (uint32 blockTimestamp) {
        blockTimestamp = _blockTimestamp();
        assert(uint(blockTimestamp) === block.timestamp);
    }

    /// @notice Adds amounts to cumulative reserves
    function shouldUpdate(bytes32 resId) public useRef(resId) returns (Data storage) {
        return res.update();
    }

    /// @notice Increases one reserve value and decreases the other by different amounts
    function shouldSwap(bytes32 resId, bool addXRemoveY, uint deltaIn, uint deltaOut) public useRef(resId) returns (Data storage) {
        return res.swap(addXRemoveY, deltaIn, deltaOut);
    }

    /// @notice Add to both reserves and total supply of liquidity
    function shouldAllocate(bytes32 resId, uint deltaX, uint deltaY, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.allocate(deltaX, deltaY, deltaL)
    }

    /// @notice Remove from both reserves and total supply of liquidity
    function shouldRemove(bytes32 resId, uint deltaX, uint deltaY, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.remove(uint deltaX, uint deltaY, uint deltaL);
    }

    /// @notice Increases available float to borrow, called when lending
    function shouldAddFloat(bytes32 resId, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.addFloat(uint deltaL);
    }

    /// @notice Reduces available float, taking liquidity off the market, called when claiming
    function shouldRemoveFloat(bytes32 resId, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.removeFloat(deltaL);
    }

    /// @notice Reduces float and increases debt of the global reserve, called when borrowing
    function shouldBorrowFloat(bytes32 resId, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.borrowFloat(deltaL);
    }

    /// @notice Increases float and reduces debt of the global reserve, called when repaying a borrow 
    function shouldRepayFloat(bytes32 resId, uint deltaL) public useRef(resId) returns (Data storage) {
       return res.repayFloat(deltaL);
    }
}