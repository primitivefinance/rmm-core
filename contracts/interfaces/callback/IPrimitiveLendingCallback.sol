pragma solidity 0.8.0;

import "../../libraries/Position.sol";

interface IPrimitiveLendingCallback {
    function borrowCallback(Position.Data calldata pos, uint deltaL) external;
    function repayFromExternalCallback(bytes32 pid, address owner, uint deltaL) external;
}