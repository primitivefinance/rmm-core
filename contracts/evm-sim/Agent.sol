pragma solidity 0.8.0;

import "./IModel.sol";

abstract contract Agent {

  IModel public model; // the model which the agent will call into
  string public name; // the name of this agent
  uint public id; // a model based id number for this agent

  constructor() {}

  /// @notice to be implemented by a higher level agent contract
  function step() public virtual;

  /// @notice to be implemented by a higher level agent contract
  function advance() public virtual;


}