pragma solidity 0.8.0;

import "./IOracle.sol";
import "../IPrimitiveEngine.sol";
import "../libraries/Calibration.sol";
import "../libraries/Reserve.sol";

import "hardhat/console.sol";

contract Model {

  IPrimitiveEngine public engine; // the primitive engine replicator contract
  IOracle public oracle; // the source of truth for our risky asset (X) price
  bytes32 public pid;
  uint public rng; // transiently set rng seed from our off-chain model

  constructor(address oracle_, address engine_) {
    oracle = IOracle(oracle_);
    engine = IPrimitiveEngine(engine_);
  }

  /**
   * @notice Creates a CFMM curve on our engine contract to use for this sim
   */
  function init(uint strike, uint32 sigma, uint32 time, uint assetPrice) public {
    Calibration.Data memory params = Calibration.Data({
      strike: strike,
      sigma: sigma,
      time: time
    });
    // set the asset price in the oracle
    oracle.setPrice(assetPrice);
    // create a curve in the engine
    engine.create(params, assetPrice);
    // store the pid in state
    pid = engine.getPoolId(params);
  }

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

  // ===== State Changing & Engine Interaction =====

  /// @notice should execute an addX swap, X -> Y.
  function swapAmountInRisky(uint deltaX) external {
    engine.addX(pid, msg.sender, deltaX, 0);
  }

  /// @notice should execute a removeX swap, Y -> X.
  function swapAmountInRiskless(uint deltaX) external {
    engine.removeX(pid, msg.sender, deltaX, type(uint256).max);
  }


  // ===== View =====

  /// @notice fetches the oracle price feed
  function getFeed() public view returns (uint) {
     return oracle.peek();
   }

  /// @notice should query the engine contract for a risky asset quote. Riskless swap Y -> X
  function getRiskyAmountIn(uint deltaX) external view returns (uint) {
    return engine.getInputAmount(pid, deltaX);
  }

  /// @notice should query the engine contract for a riskFree asset quote. Risky swap X -> Y
  function getRiskFreeAmountOut(uint deltaX) external view returns (uint) {
    return engine.getOutputAmount(pid, deltaX);
  }

  function getSpotPrice() external view returns (uint) {
      return engine.getOutputAmount(pid, 1e18);
  }

  function getSpotPriceAfterVirtualSwapAmountInRiskless() external view returns (uint) {

  }

  function getSpotPriceAfterVirtualSwapAmountInRisky(uint deltaX) external view returns (uint) {
      Reserve.Data memory res = engine.getReserve(pid);
      uint currRX1 = res.RX1 + deltaX;
      int128 outRY2 = engine._getOutputRY2(pid, deltaX);
  }

}