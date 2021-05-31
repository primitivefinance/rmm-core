# Primitive V2

This repository is for the core contracts of the Primitive V2 protocol. These are low-level contracts which are designed to be interacted primarily through other smart contracts.

# Bug Bounty

This repository has a bug bounty through Immunefi. Details are on their website [https://immunefi.com/bounty/primitive](https://immunefi.com/bounty/primitive/).

# Documentation

The contract documentation is hosted here: [Primitive Docs](https://docs.primitive.finance)

## Overview

This repository has three main contracts: Factory, Engine, and House.

### Factory

The Factory contract is responsible for deploying new Engine contracts.

### House

The House contract is a higher-level contract that is designed to interact with the Engine on behalf of users.

### Engine

The Engine contract contains two tokens in immutable state called risky and stable. Pools can be created for these tokens within the Engine contract.

# Testing

### Compile contracts

`yarn compile`

### Run the tests

`yarn test`

### Run coverage

`yarn coverage`

# Security

All audits are located in the audits/ folder.

# Deployed Addresses

The deployed contract addresses for all of Primitive are located here: [Contract Database](https://www.notion.so/primitivefi/dc3b883ff9d94044b6738701b2826f7a?v=9e56507d430d4f4fb1939242cfb23736)

# Access Control

The Engine contract which holds funds has no access control. The Factory contract has an owner variable, but there are no functions on the factory which only the owner can call. All the factory's public functions can be called by anyone.
