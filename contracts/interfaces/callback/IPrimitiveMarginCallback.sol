// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

interface IPrimitiveMarginCallback {
    function depositCallback(uint deltaX, uint deltaY, bytes calldata data) external;
}