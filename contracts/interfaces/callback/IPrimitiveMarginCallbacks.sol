pragma solidity 0.8.0;

interface IPrimitiveMarginCallbacks {
    function depositCallback(uint deltaX, uint deltaY) external;
}