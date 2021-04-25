# EVM-Simulator

This src directory has the files to run an Agent Based Simulation in the hardhat evm.

## Objective

- What is the difference between the value of a replicated LP share and the black-scholes covered short call price after X amount of blocks if the price of the risky asset changes +/- 3% per block?

## How to run

`yarn sim`

## Basic guide

1. Start at the ./src/scripts/run.ts file. This is the highest level code which starts the simulation with `yarn sim`.
2. Several contracts are deployed for our on-chain simulation using the signers[0] signer.
3. With the contracts at hand, a new `Model` typescript class is instantiated using the `HardhatRunTimeEnvironment`, the `Model.sol` deployed contract and the `Agent` smart contract (`PureArbitrageur.sol`).
4. Finally the typescript `Model` class is started by calling `await model.run()`

The `Model` has a boolean `running` which is set to true when the class is instantiated. The `run()` function will enter a while loop using the `this.running` condition. Inside the while loop is a call to iterate the ticks of the model `await this.tick()`.

A `tick()` action for the model defines what happens at each iteration. For this starting model, the `tick` process is:

1. Mine a block in the hardhat evm
2. Fetch a random integrater and call the smart contract Model's `tick()` function, passing the RNG int as a param.
3. The smart contract will do its logic in the tick function. For example, update an oracle price feed.
4. Then the `Agent` typescript class's function `step()` is called. The agent will then call its smart contract function `step()`, which has all the logic for the agent. This `PureArbitrageur` agent will execute a swap through the model contract, if conditions are right.
5. After the agent is stepped, the latest data is fetched from the smart contract and stored in the Model instance.
6. Finally, the exit condition is checked, and if passed it will set `running = false`, exiting the `model.run()` while loop.

Go get em`.

## Agent Based Simulation fundamentals

### Agents

- Agents are entities which have a `step` that they must execute within a `model` environment.

### Model

- A group of `agents` who individually take `steps` when the model is iterated. Each model `step` process is called a `tick`. The `steps` of `agents` can be actions on a target smart contract, to monitor the state of the system over time.

### Scheduler

- Defines the process for adding `agents` to the model.
- To be implemented

## Directories

### Contracts

- Has the `agent` smart contracts which individually implement a `step` function that defines what action they take if requested.
- Contains the `Model` contract which agents will call to manipulate the system. The `Model` defines the configuration and core logic of how the system gets manipulated by agents.
- Contains external contracts which both provide information to the `Model` and `Agent` contracts. For example, an `Oracle` which gives a `price` state variable and an infinite liquidity pool to swap between the asset of the oracle (assume a risky asset like ETH) and a risk free asset.

### Scripts

- Contains the script files to run the model.

### Entities

- Contains the typescript based logic to call the smart contracts.
