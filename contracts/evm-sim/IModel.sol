pragma solidity 0.8.0;

import {IERC20} from "../PrimitiveEngine.sol";

interface IModel {
    function deposit(uint deltaX, uint deltaY) external;
    function swapAmountInRisky(uint deltaX) external returns(uint);
    function swapAmountInRiskless(uint deltaX) external returns(uint);

    // ===== View =====
    function getFeed() external view returns (uint);
    function getSpotPrice() external view returns (uint);
    function getRiskyAmountIn(uint amountIn) external view returns (uint);
    function getRiskFreeAmountOut(uint amountIn) external view returns (uint);

}