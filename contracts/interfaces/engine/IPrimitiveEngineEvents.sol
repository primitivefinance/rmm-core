pragma solidity 0.8.0;

interface IPrimitiveEngineEvents {
    event Create(address indexed from, bytes32 indexed pid, uint strike, uint sigma, uint time); // Create pool
    event Updated(bytes32 pid, uint reserveRisky, uint reserveStable, uint blockNumber); // Update pool reserves
    
    // ===== Margin ====
    event Deposited(address indexed from, address indexed owner, uint deltaX, uint deltaY); // Depost margin
    event Withdrawn(address indexed from, uint deltaX, uint deltaY); // Withdraw margin
    
    // ===== Liquidity =====
    event Allocated(address indexed from, uint deltaX, uint deltaY); // Add liq to curve
    event Removed(address indexed from, uint deltaX, uint deltaY); // Remove liq
    
    // ===== Swaps =====
    event Swap(address indexed from, bytes32 indexed pid, bool indexed addXRemoveY, uint deltaIn, uint deltaOut);
    
    // ===== Lending =====
    event Loaned(address indexed from, bytes32 indexed pid, uint deltaL);
    event Claimed(address indexed from, bytes32 indexed pid, uint deltaL);
    event Borrowed(address indexed recipient, bytes32 indexed pid, uint deltaL, uint maxPremium);
    event Repaid(address indexed owner, bytes32 indexed pid, uint deltaL);

    // ===== Flash =====
    event Flash(address indexed from, address indexed receiver, address indexed token, uint amount, uint payment);
}