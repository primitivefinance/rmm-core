// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

import "./libraries/Calibration.sol";
import "./libraries/Reserve.sol";

interface IPrimitiveEngine {
    struct Position {
        address owner;
        uint nonce;
        uint BX1;
        uint BY2;
        uint liquidity;
        bool unlocked;
    }
    // ==== State =====

    // Curve
    function create(Calibration.Data memory self, uint assetPrice) external;
    // Liquidity
    function addBoth(bytes32 pid, address owner, uint nonce, uint deltaL) external returns (uint, uint);
    function removeBoth(bytes32 pid, uint nonce, uint deltaL, bool isInternal) external returns (uint, uint);
    // Swaps
    function swap(bytes32 pid, bool addXRemoveY, uint deltaOut, uint deltaInMax) external returns (uint deltaIn);
    // Margin
    function deposit(address owner, uint deltaX, uint deltaY) external returns (bool);
    function withdraw(uint deltaX, uint deltaY) external returns (bool);
    // Lending
    function lend(bytes32 pid, uint nonce, uint deltaL) external returns (uint);
    function borrow(bytes32 pid, address owner, uint nonce, uint deltaL, uint maxPremium) external returns (uint);
    function repay(bytes32 pid, address owner, uint nonce, uint deltaL) external returns (uint);
    
    // ===== View =====
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);
    function getOutputAmount(bytes32 pid, uint deltaX) external view returns (uint);
    function getInputAmount(bytes32 pid, uint deltaX) external view returns (uint);
    function getPosition(address owner, uint nonce) external view returns (Position memory);
    function getInvariantLast() external view returns (int128);
    function getBX1() external view returns (uint);
    function getBY2() external view returns (uint);
    function TX1() external view returns (address);
    function TY2() external view returns (address);
    function FEE() external view returns (uint);
    function INIT_SUPPLY() external view returns (uint);
    function getPoolId(Calibration.Data memory self) external view returns(bytes32);
    function getReserve(bytes32 pid) external view returns (Reserve.Data memory);
    function _getOutputRY2(bytes32 pid, uint deltaX) external view returns (int128);
}