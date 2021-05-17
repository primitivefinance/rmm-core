pragma solidity 0.8.0;

interface IPrimitiveSwapCallback {
    function swapCallback(uint deltaX, uint deltaY) external;
}