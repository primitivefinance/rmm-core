pragma solidity 0.8.0;

contract Oracle {
  event SetOraclePrice(uint newPrice);

  uint private price; // an internal price value which is fetched with "peek"

  constructor() {}

  /// @notice sets the `price` private variable to any value.
  function setPrice(uint price_) public {
    price = price_;
    emit SetOraclePrice(price_);
  }

  /// @notice returns the `price`
  function peek() public view returns (uint) {
    return price;
  }
}