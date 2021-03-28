# Primitive-v2-core

Primitive is an options market protocol. The contracts are used permissionlessly to create and maintain markets for options on any token on Ethereum.

## Engine

The Engine is an AMM implemented to replicate a portfolio value equal to Black-scholes priced covered calls.

Each Engine contract is created with two token addresses: `TX1` and `TY2`.
To initialize the contract, there are three variables which must be passed to it: `strike`, `sigma`, and `time`.

`strike`: The strike price of the option.
`sigma`: The implied volatility of the option.
`time`: The time until expiry of the option.

There are functions to add liquidity, remove liquidity, swap between X and Y (corresponding to RISKY and RISK FREE tokens), and directly increase or decrease position balances denominated in X and Y through a periphery contract called `House`.

## House

The House contract wraps the Engine contract and calls into it directly. The higher level House contract can handle periphery business logic, like how to handle token payments, deposits, and swaps. When the House is called, the state variable `CALLER` is transiently set so the Engine can reference the original `msg.sender` of the House's fn call. A House contract is needed because there are virtual callback functions in Engine which must be implemented by the `msg.sender` of the Engine's functions. This make it so EOAs can only call one function directly, which is when liquidity is being removed with `removeBoth`.

## Testing

`yarn test:<network>`

## Deploying

`yarn deploy:<network>`

## Verifying

`yarn verify:<network>`
