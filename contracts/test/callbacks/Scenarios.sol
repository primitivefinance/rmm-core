// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

abstract contract Scenarios {
    Scenario public scenario = Scenario.SUCCESS;

    enum Scenario {
        FAIL,
        SUCCESS,
        RISKY_ONLY,
        STABLE_ONLY,
        REENTRANCY
    }

    function risky() public view virtual returns (address);

    function stable() public view virtual returns (address);

    function getCaller() public view virtual returns (address);
}
