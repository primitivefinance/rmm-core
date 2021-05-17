pragma solidity 0.8.0;

interface IPrimitiveLendingCallbacks {
    function borrowCallback(Position.Data calldata pos, uint deltaL) external;
    function repayFromExternalCallback(bytes32 pid, address owner, uint nonce, uint deltaL) external;
}