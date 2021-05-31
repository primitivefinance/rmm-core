// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

import "./libraries/Calibration.sol";
import "./libraries/Reserve.sol";
import "./libraries/Margin.sol";
import "./libraries/Position.sol";

interface IPrimitiveEngine {

    // EVENTS
    event Create(address indexed from, bytes32 indexed pid, Calibration.Data calibration); // Create pool
    event Update(uint R1, uint R2, uint blockNumber); // Update pool reserves
    event Deposited(address indexed from, address indexed owner, uint deltaX, uint deltaY); // Depost margin
    event Withdrawn(address indexed from, address indexed owner, uint deltaX, uint deltaY); // Withdraw margin
    event AddedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY); // Add liq to curve
    event RemovedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY); // Remove liq
    event Swap(address indexed from, bytes32 indexed pid, bool indexed addXRemoveY, uint deltaIn, uint deltaOut);

    // ===== State =====

    // Curve
    function create(Calibration.Data memory self, uint assetPrice) external;
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
    function borrow(bytes32 pid, address owner, uint deltaL, uint maxPremium) external returns (uint);
    function repay(bytes32 pid, address owner, uint deltaL, bool isInternal) external returns (uint, uint);
    
    // ===== View =====
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);
    function getInvariantLast(bytes32 pid) external view returns (int128);
    function FEE() external view returns (uint);
    function INIT_SUPPLY() external view returns (uint);
    function calcRY2WithXOut(bytes32 pid, uint deltaXOut) external view returns (int128);
    function calcRX1WithYOut(bytes32 pid, uint deltaYOut) external view returns (int128);
    function getPosition(address owner, uint nonce, bytes32 pid) external view returns (Position.Data memory pos);
    function getAllPoolsLength() external view returns (uint len);
    // ===== Pool Tokens =====
    function getBX1() external view returns (uint);
    function getBY2() external view returns (uint);
    function TX1() external view returns (address);
    function TY2() external view returns (address);

    // ===== Pool States =====
    function getReserve(bytes32 pid) external view returns (Reserve.Data memory);
    function getCalibration(bytes32 pid) external view returns (Calibration.Data memory);
    function getMargin(address owner) external view returns (Margin.Data memory);
    function getPoolId(Calibration.Data memory self) external view returns(bytes32);
}
