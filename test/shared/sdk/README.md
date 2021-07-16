# Primitive V2 SDK

This repository has typescript files which make it easier to interact with Primitive V2. Each of the smart contracts in production has a typescript file for it, which implements the same functions. This makes it very easy to make typescript objects of the V2 smart contracts, like the Engine, and simulate it by calling its core functions.

## Overview

- Engine.ts: Contains the Engine typescript class representation, which can be created without on-chain data. There is a utility function `getEngineEntityWithContract` which will take the actual PrimitiveEngine instance (initialized with ethers) and parse its state, returning a clone of the contract in typescript! Cool.
- ReplicationMath.ts: Contains the math functions for the trading function of the Engine, implemented in Javascript.
- CumulativeDistributionFunction.ts: Contains the math for the CDF and Inverse CDF, implemented in Javascript and used in the BlackScholes math library.
- BlackScholes.ts: Contains pure functions to calculate the call delta of an option based on its parameters.
- Struct.ts: Contains the typescript interfaces for the structs in the PrimitiveEngine contract (`Margin.Data`, `Reserve.Data`, `Position.Data`, and `Calibration`).
- Units.ts: Managing all the different number types in web3 applications is not fun... This file contains several class which really serve to make your unit experience easier. For example, the class `Wei` should be used whenever we are handling smart contract `uint`s. The class comes with utility functions to parse the wei value into its raw BigNumber, a float, or a string. The `Percentage` class will scale percentages to integers by using the same constant we use to scale the percentage passed to the smart contract. `Mantissa` class is very similar to `Percentage`. And finally, the `Time` class can be instantiated by passing an amount of `seconds` to it. The raw value will return the time amount in seconds, but it also has a getter for returning in units of years!
- /test/: A directory to test the `Engine` class, so we know it's working correctly!

### Notes:

There are two `Token`s. One `Token` is the typechain contract interface, the other is a typescript class representation in the `./entities.ts` file.

The `Wei` class can use the attribute `float` to return a wei value as a number. Keep in mind `float` is also a struct variable name in the PrimitiveEngine.sol contract. You may see something like `reserve.float.float`, which just means we are returning the Reserve float value as a number.
