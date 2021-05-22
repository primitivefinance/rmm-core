pragma solidity 0.8.0;

import "./IOracle.sol";
import "../interfaces/IPrimitiveEngine.sol";
import "../libraries/Calibration.sol";
import "../libraries/Reserve.sol";
import "../libraries/Units.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

interface ICallback {
  function depositCallback(uint deltaX, uint deltaY) external;
  function addXCallback(uint deltaX, uint deltaY) external;
  function removeXCallback(uint deltaX, uint deltaY) external;
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
    engine.create(strike, sigma, time, assetPrice);
    // store the pid in state
    pid = engine.getPoolId(strike, sigma, time);
  }

  // ===== Model Advancement =====

  /// @notice move the model forward using off-chain rng seed
  function tick(uint newAssetPrice) public {
    oracle.setPrice(newAssetPrice);
  }

  // ===== State Changing & Engine Interaction =====

  function deposit(uint deltaX, uint deltaY) external {
    engine.deposit(msg.sender, deltaX, deltaY);
  }
  function depositCallback(uint deltaX, uint deltaY) external override {
    IERC20 risky = IERC20(engine.risky());
    IERC20 stable = IERC20(engine.stable());
    if(deltaX > 0) risky.safeTransfer(msg.sender, deltaX); // msg.sender is engine
    if(deltaY > 0) stable.safeTransfer(msg.sender, deltaY);
  }

  function addXCallback(uint deltaX, uint deltaY) external override {}
  function removeXCallback(uint deltaX, uint deltaY) external override {}

  /// @notice should execute an addYRemoveX swap, Y -> X.
  function swapAmountOutRisky(uint deltaX) external returns(uint) {
    // swap params: pool id, addXRemoveY, amountOut, maxAmountIn
    return engine.swap(pid, false, deltaX, type(uint256).max, true);
  }

  /// @notice should execute an addXRemoveY swap, X -> Y.
  function swapAmountOutRiskFree(uint deltaY) external returns (uint) {
    return engine.swap(pid, true, deltaY, type(uint256).max, true);
  }


  // ===== View =====

  /// @notice fetches the oracle price feed
  function getFeed() public view returns (uint) {
     return oracle.peek();
   }

  function getReserves() public view returns (uint, uint) {
    (uint RX1, uint RY2, , , , , , ,) = engine.reserves(pid);
    return (RX1, RY2);
  }
}