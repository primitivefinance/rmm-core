pragma solidity 0.8.0;
pragma abicoder v2;

import "./libraries/Position.sol";
import "./libraries/Margin.sol";

interface IPrimitiveHouse {
    // init
    function initialize(address engine_, address factory_, uint24 fee_) external;
    // Margin
    function deposit(address owner, uint deltaX, uint deltaY) external;
    function withdraw(uint deltaX, uint deltaY) external;
    function addBothFromMargin(bytes32 pid, address owner, uint nonce, uint deltaL) external;
    function addBothFromExternal(bytes32 pid, address owner, uint nonce, uint deltaL) external;
    function repayFromExternal(bytes32 pid, address owner, uint nonce, uint deltaL) external;
    function repayFromMargin(bytes32 pid, address owner, uint nonce, uint deltaL) external;
    // Swap
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint maxDeltaIn) external;
    function swapXForY(bytes32 pid, uint deltaOut) external;
    function swapYForX(bytes32 pid, uint deltaOut) external;
    // Lending
    function lend(bytes32 pid, uint nonce, uint deltaL) external;
}
