// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../interfaces/IPrimitiveEngine.sol";
import "../interfaces/IERC20.sol";
import "./callbacks/TestAllocateCallback.sol";
import "./callbacks/TestCreateCallback.sol";
import "./callbacks/TestDepositCallback.sol";
import "./callbacks/TestSwapCallback.sol";

abstract contract TestBase is TestAllocateCallback, TestCreateCallback, TestDepositCallback, TestSwapCallback {
    address public engine;
    address public caller;

    constructor(address engine_) {
        engine = engine_;
    }

    function setEngine(address engine_) public {
        engine = engine_;
    }

    function risky() public view override(Scenarios) returns (address) {
        return IPrimitiveEngine(engine).risky();
    }

    function stable() public view override(Scenarios) returns (address) {
        return IPrimitiveEngine(engine).stable();
    }

    function getCaller() public view override(Scenarios) returns (address) {
        return caller;
    }

    function getPosition(bytes32 poolId) public view returns (bytes32 posid) {
        posid = keccak256(abi.encodePacked(address(this), poolId));
    }

    function name() public pure virtual returns (string memory);
}
