pragma solidity 0.8.0;

import "./Agent.sol";
import "./IModel.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract PureArbitrageur is Agent {
  using SafeERC20 for IERC20;

  event Deposited(uint deltaX, uint deltaY);
  event SwapInRisky(uint deltaX, uint deltaY);
  event SwapOutRiskFree(uint deltaX, uint deltaY);

  // our data struct with enough info about the state
  struct Data {
    uint number;
    uint feed;
    uint BX1;
    uint BY2;
    bool stepped;
  }

  Data[1000] public data; // our continuous data struct, over 1000 blocks

  uint public startBlock; // block the model is initialized at
  uint public latestBlock; // the previously set distance block
  

  constructor(
    string memory name_,
    uint id_,
    address model_
  ) {

    name = name_;
    id = id_;
    model = IModel(model_);
    startBlock = block.number;
  }


  /// @notice deposit some tokens to use to arb the pool
  function deposit(uint deltaX, uint deltaY) external {
    model.deposit(deltaX, deltaY);
  }


  // ===== Swaps =====

  function swapAmountInRisky(uint deltaX) external {
    uint deltaY = model.swapAmountInRisky(deltaX);
    emit SwapInRisky(deltaX, deltaY);
  }

  function swapAmountInRiskless(uint deltaX) external {
    uint deltaY = model.swapAmountInRiskless(deltaX);
    emit SwapOutRiskFree(deltaX, deltaY);
  }

  /**
  * @notice A pure arbitrageur will swap assets in a CFMM
  *         if the output is worth more than the market
  *         value of the input.
  * @dev    This agent will arb in either direction.
  */
  function step() public override {
    console.log("enter agent step");
    // get the current price of X
    uint spot = model.getSpotPrice();
    uint feed = model.getFeed();

    console.log("get feed:", feed);

    // get the amount of X output based on 1 Y
    uint deltaX = model.getRiskyAmountIn(1);
    // get the amount of Y output based on 1 X
    uint deltaY = model.getRiskFreeAmountOut(1);
    // get the value outputs
    uint BX1 = deltaX * feed / 1e18;
    uint BY2 = deltaY;

    // init a bool to check if we step
    bool tookStep;

    // If risky swap has a greater output than the feed, do the swap
    if(BX1 > feed) {
      model.swapAmountInRisky(1);
      tookStep = true;
    } else if (BY2 > feed) {
      model.swapAmountInRiskless(1);
      tookStep = true;
    }
    
    // get distance from start block
    uint distance = block.number > startBlock ? block.number - startBlock : 0;
    // log the current data at this distance
    data[distance] = Data({
      number: block.number,
      feed: feed,
      BX1: BX1,
      BY2: BY2,
      stepped: tookStep
    });
    // log the latest distance
    latestBlock = distance;

    console.log("did we step?", tookStep);
  }

  /// @notice store the data at this block into state
  function storeData() external {
    uint feed = model.getFeed();
    // get distance from start block
    uint distance = block.number > startBlock ? block.number - startBlock : 0;
    // log the current data at this distance
    data[distance] = Data({
      number: block.number,
      feed: feed,
      BX1: 0,
      BY2: 0,
      stepped: true
    });
  }

  /// @notice fetches the data at `latestBlock` which is the previous set data at `distance`.
  function getLatestData() public view returns (uint number, uint feed, uint BX1, uint BY2, bool stepped) {
    Data memory d = data[latestBlock];
    return (d.number, d.feed, d.BX1, d.BY2, d.stepped);
  }
}