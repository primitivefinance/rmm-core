pragma solidity 0.8.0;

interface IPrimitiveEngineView {
    // ===== View =====
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);
    function invariantOf(bytes32 pid) external view returns (int128);

    // ===== Immutables =====
    function factory() external view returns (address);
    function risky() external view returns (address);
    function stable() external view returns (address);

    // ===== Pool States =====
    function reserves(bytes32 pid) external view returns (uint RX1, uint RY2, uint liquidity, uint float, uint debt);
    function settings(bytes32 pid) external view returns (uint strike, uint sigma, uint time);
    function positions(bytes32 posId) external view returns (
        address owner, bytes32 pid, uint balanceX, uint balanceY, uint liquidity, uint float, uint debt
    );
    function margins(address owner) external view returns (uint BX1, uint BY2, bool unlocked);
    function getPoolId(uint strike, uint sigma, uint time) external view returns(bytes32);
    function getAllPoolsLength() external view returns (uint len);
}