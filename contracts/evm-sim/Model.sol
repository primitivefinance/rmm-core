pragma solidity 0.8.0;

import "./IOracle.sol";

import "hardhat/console.sol";

contract Model {

  IOracle public oracle; // the source of truth for our risky asset (X) price
  uint public rng; // transiently set rng seed from our off-chain model

  constructor(address oracle_) {
    oracle = IOracle(oracle_);
  }

  // ===== State Changing =====

  /// @notice should execute a removeX swap, Y -> X.
  function swapToRisky() external {}

  /// @notice should execute an addX swap, X -> Y.
  function swapToRiskFree() external {}

  // ===== Model Advancement =====

  /// @notice move the model forward using off-chain rng seed
  function tick(uint random) public {
    console.log("enter model tick");
    rng = random;
    if(random > 5) {
      tickUp();
    } else {
      tickDown();
    }
    console.log("exit model tick");
  }

  /// @notice moves the oracle feed price UP based on the off-chain seed
  function tickUp() public {
    oracle.setPrice(getFeed() + rng);
    console.log("tick up");
  }

  /// @notice moves the oracle feed price DOWN based on the off-chain seed
  function tickDown() public {
    uint curr = getFeed();
    oracle.setPrice(curr > rng ? curr - rng : 0);
    console.log("tick down");
  }

  function advance() public {}

  // ===== View =====

  /// @notice fetches the oracle price feed
  function getFeed() public view returns (uint) {
     return oracle.peek();
   }

  /// @notice should query the engine contract for a risky asset quote
  function getRiskyAmountOut(uint amountIn) external view returns (uint) {
    return 0;
  }

  /// @notice should query the engine contract for a riskFree asset quote
  function getRiskFreeAmountOut(uint amountIn) external view returns (uint) {
    return 0;
  }

}