pragma solidity 0.8.0;

import "../../libraries/Calibration.sol";

interface IPrimitiveEngineActions {
    // Curve
    function create(Calibration.Data memory self, uint assetPrice) external returns (bytes32 pid);
    // Liquidity
    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL, bool isInternal) external returns (uint, uint);
    function removeBoth(bytes32 pid, uint nonce, uint deltaL, bool isInternal) external returns (uint, uint);
    // Swaps
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) external returns (uint deltaIn);
    // Margin
    function deposit(address owner, uint deltaX, uint deltaY) external returns (bool);
    function withdraw(uint deltaX, uint deltaY) external returns (bool);
    // Lending
    function lend(bytes32 pid, uint nonce, uint deltaL) external returns (uint);
    function claim(bytes32 pid, uint nonce, uint deltaL) external returns (uint);
    function borrow(bytes32 pid, address owner, uint nonce, uint deltaL, uint maxPremium) external returns (uint);
    function repay(bytes32 pid, address owner, uint nonce, uint deltaL, bool isInternal) external returns (uint, uint);
}