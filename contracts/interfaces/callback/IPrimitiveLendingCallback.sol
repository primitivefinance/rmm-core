pragma solidity 0.8.0;

interface IPrimitiveLendingCallback {
    function borrowCallback(Position.Data calldata pos, uint deltaL) external;
    function repayFromExternalCallback(bytes32 pid, address owner, uint nonce, uint deltaL) external;
}