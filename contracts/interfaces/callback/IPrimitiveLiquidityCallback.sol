// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

interface IPrimitiveLiquidityCallback {
    function allocateCallback(uint deltaX, uint deltaY, bytes calldata data) external;
    function removeCallback(uint deltaX, uint deltaY, bytes calldata data) external;
}