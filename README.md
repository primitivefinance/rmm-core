![](https://pbs.twimg.com/profile_banners/1241234631707381760/1588727988/1500x500)

# Primitive Replicating Market Maker

[![](https://img.shields.io/github/stars/primitivefinance/primitive-v2-core?style=social)](https://img.shields.io/github/stars/primitivefinance/primitive-v2-core?style=social)
![Twitter Follow](https://img.shields.io/twitter/follow/primitivefi?style=social)
[![Discord](https://img.shields.io/discord/168831573876015105.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/rzRwJ4K)

This repository is for the core contracts of the Primitive Protocol's Automated Market Maker named "RMM-01". These are low-level contracts which are designed to be interacted through higher-level smart contracts.

The low-level contracts are missing important checks that should be implemented by smart contracts. Keep this in mind when interacting with them.

# Bug Bounty

This repository has a **$250,000** bug bounty through Immunefi. Details are on their website [https://immunefi.com/bounty/primitive](https://immunefi.com/bounty/primitive/).

# Documentation

The contract documentation is hosted here: [Primitive Docs](https://docs.primitive.finance)

# Contracts

This repository has two contracts: PrimitiveFactory and PrimitiveEngine

### Factory

The Factory contract is responsible for deploying new Engine contracts.

### Engine

The Engine contract contains two tokens in immutable state called risky and stable. Pools can be created for these tokens within the Engine contract.

# Testing

The testing environment is unique. Make sure that `yarn typechain` has been run first, or else there could be typescript compilation issues.

The test function makes use of the `parallel` tag, which will take up a considerable amount of CPU power. It makes the tests run faster.

In the `/test/shared/poolConfigs.ts` file is an array of different curve parameters. Each of these pools will go through the entire test suite.

## Compile contracts

`yarn compile`

## Run typechain

`yarn typechain`

## Run the tests

`yarn test`

## Compile and run typechain with

`yarn compile:all`

# Security

All audits are located in the `audits/` folder.

The core contracts are audited by three teams: Chainsecurity, ABDK Consulting, Sherlock, and Dedaub.

# Deployed Addresses

The deployed contract addresses for all of Primitive are located here: [Contract Database](https://www.notion.so/primitivefi/dc3b883ff9d94044b6738701b2826f7a?v=9e56507d430d4f4fb1939242cfb23736)

# Access Control

The Engine contract holds funds and has no access control.

The Factory contract has an owner variable, but there are no functions on the factory which only the owner can call. All the factory's public functions can be called by anyone.
