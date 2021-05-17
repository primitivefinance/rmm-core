pragma solidity 0.8.0;

interface IPrimitiveEngineEvents {
    event Create(address indexed from, bytes32 indexed pid, uint strike, uint sigma, uint time); // Create pool
    event Update(uint R1, uint R2, uint blockNumber); // Update pool reserves
    event Deposited(address indexed from, address indexed owner, uint deltaX, uint deltaY); // Depost margin
    event Withdrawn(address indexed from, address indexed owner, uint deltaX, uint deltaY); // Withdraw margin
    event AddedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY); // Add liq to curve
    event RemovedBoth(address indexed from, uint indexed nonce, uint deltaX, uint deltaY); // Remove liq
    event Swap(address indexed from, bytes32 indexed pid, bool indexed addXRemoveY, uint deltaIn, uint deltaOut);
}