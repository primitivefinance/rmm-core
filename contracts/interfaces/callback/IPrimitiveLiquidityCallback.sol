pragma solidity 0.8.0;

interface IPrimitiveLiquidityCallback {
    function allocateCallback(uint deltaX, uint deltaY) external;
    function removeCallback(uint deltaX, uint deltaY) external;
}