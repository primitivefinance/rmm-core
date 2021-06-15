// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

interface IPrimitiveCreateCallback {
    function createCallback(
        uint256 deltaX,
        uint256 deltaY,
        bytes calldata data
    ) external;
}
