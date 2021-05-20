pragma solidity 0.8.0;

interface IPrimitiveEngineView {
    // ===== View =====

    /// @notice Computes the reserve value of `token` using the known `reserve` value of the other token
    /// @param  pid The hashed pool Id
    /// @param  token The reserve of the token to compute
    /// @param  reserve The reserve of the other token, which is known
    /// @return reserveOfToken The reserve of the `token`
    function compute(bytes32 pid, address token, uint reserve) external view returns (int128 reserveOfToken);
    function calcInvariant(bytes32 pid, uint postR1, uint postR2, uint postLiquidity) external view returns (int128);
    function invariantOf(bytes32 pid) external view returns (int128);

    // ===== Immutables =====
    function factory() external view returns (address);
    function risky() external view returns (address);
    function stable() external view returns (address);

    // ===== Pool States =====
    function reserves(bytes32 pid) external view returns (
        uint RX1, uint RY2, uint liquidity, uint float, uint debt, uint feeRisky, uint feeStable
        );
    function settings(bytes32 pid) external view returns (uint strike, uint sigma, uint time);
    function positions(bytes32 posId) external view returns (
        address owner, bytes32 pid, uint balanceX, uint balanceY, uint liquidity, uint float, uint debt
    );
    function margins(address owner) external view returns (uint BX1, uint BY2, bool unlocked);
    function getPoolId(uint strike, uint sigma, uint time) external view returns(bytes32);
    function getAllPoolsLength() external view returns (uint len);
}