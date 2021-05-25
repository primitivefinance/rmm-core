pragma solidity 0.8.0;

import "../../libraries/Position.sol";

interface IPrimitiveLendingCallback {
    function borrowCallback(uint deltaL, uint deltaX, uint deltaY) external;
    function repayFromExternalCallback(bytes32 pid, address owner, uint deltaL) external;
}
