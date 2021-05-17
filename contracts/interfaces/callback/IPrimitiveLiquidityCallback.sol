pragma solidity 0.8.0;

interface IPrimitiveLiquidityCallback {
    function addBothFromExternalCallback(uint deltaX, uint deltaY) external;
    function removeXYCallback(uint deltaX, uint deltaY) external;
}