pragma solidity 0.8.0;

interface IOracle { 
    function setPrice(uint price) external;

    // ===== View =====
    function peek() external view returns (uint);
}