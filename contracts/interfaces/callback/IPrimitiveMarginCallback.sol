pragma solidity 0.8.0;

interface IPrimitiveMarginCallback {
    function depositCallback(uint deltaX, uint deltaY) external;
}