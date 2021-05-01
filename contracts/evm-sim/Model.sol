pragma solidity 0.8.0;

import "./IOracle.sol";
import "../IPrimitiveEngine.sol";
import "../libraries/Calibration.sol";
import "../libraries/Reserve.sol";
import "../libraries/Units.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

interface ICallback {
  function depositCallback(uint deltaX, uint deltaY) external;
}

contract Model is ICallback {
  using Units for *;
  using SafeERC20 for IERC20;

  IPrimitiveEngine public engine; // the primitive engine replicator contract
  IOracle public oracle; // the source of truth for our risky asset (X) price
  bytes32 public pid;

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
  function tick(uint newAssetPrice) public {
    console.log("enter model tick");
    oracle.setPrice(newAssetPrice);
    console.log("exit model tick");
  }

  // ===== State Changing & Engine Interaction =====

  function deposit(uint deltaX, uint deltaY) external {
    engine.deposit(msg.sender, deltaX, deltaY);
  }
  function depositCallback(uint deltaX, uint deltaY) external override {
    IERC20 TX1 = IERC20(engine.TX1());
    IERC20 TY2 = IERC20(engine.TY2());
    if(deltaX > 0) TX1.safeTransfer(msg.sender, deltaX);
    if(deltaY > 0) TY2.safeTransfer(msg.sender, deltaY);
  }

  /// @notice should execute an addX swap, X -> Y.
  function swapAmountInRisky(uint deltaX) external returns(uint) {
    return engine.addX(pid, msg.sender, deltaX, 0);
  }

  /// @notice should execute a removeX swap, Y -> X.
  function swapAmountInRiskless(uint deltaX) external returns(uint) {
    return engine.removeX(pid, msg.sender, deltaX, type(uint256).max);
  }


  // ===== View =====

  /// @notice fetches the oracle price feed
  function getFeed() public view returns (uint) {
     return oracle.peek();
   }

  /// @notice should query the engine contract for a risky asset quote. Riskless swap Y -> X
  function getRiskyAmountIn(uint deltaX) external view returns (uint) {
    return engine.getInputAmount(pid, deltaX); // fix
  }

  /// @notice should query the engine contract for a riskFree asset quote. Risky swap X -> Y
  function getRiskFreeAmountOut(uint deltaX) external view returns (uint) {
    return engine.getOutputAmount(pid, deltaX); // fix
  }

  function getSpotPrice() external view returns (uint) {
      return engine.getOutputAmount(pid, 1e18); // fix
  }

  function getSpotPriceAfterVirtualSwapAmountInRiskless() external view returns (uint) {
    // fix
  }

  function getSpotPriceAfterVirtualSwapAmountInRisky(uint deltaX) external view returns (uint) {
      Reserve.Data memory res = engine.getReserve(pid);
      uint currRX1 = res.RX1 + deltaX;
      uint currRY2 = engine._getOutputRY2(pid, deltaX).parseUnits(); // fox
  }

}