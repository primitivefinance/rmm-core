pragma solidity 0.8.0;

interface IModel {
    function swapToRisky() external;
    function swapToRiskFree() external;

    // ===== View =====
    function getFeed() external view returns (uint);
    function getRiskyAmountOut(uint amountIn) external view returns (uint);
    function getRiskFreeAmountOut(uint amountIn) external view returns (uint);

}