![](https://pbs.twimg.com/profile_banners/1241234631707381760/1588727988/1500x500)

# Primitive Replicating Market Maker

[![Tests](https://github.com/primitivefinance/rmm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/primitivefinance/rmm-core/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@primitivefi/rmm-core/latest.svg)](https://www.npmjs.com/package/@primitivefi/rmm-core/v/latest)
[![](https://img.shields.io/github/stars/primitivefinance/primitive-v2-core?style=social)](https://img.shields.io/github/stars/primitivefinance/primitive-v2-core?style=social)
![Twitter Follow](https://img.shields.io/twitter/follow/primitivefi?style=social)
[![Discord](https://img.shields.io/discord/168831573876015105.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/rzRwJ4K)

Core contracts of Primitive RMM protocol.

# Bug Bounty

This repository has a **$1,000,000** bug bounty through Immunefi. Details are on their website [https://immunefi.com/bounty/primitive](https://immunefi.com/bounty/primitive/).

# Documentation

The contract documentation is hosted here: [Primitive Docs](https://docs.primitive.finance)

# Testing

## Compile contracts

`yarn compile`

## Run typechain

`yarn typechain`

## Run the tests

`yarn test`

## Run the tests using --parallel flag

`yarn test:fast`

## Notes

Running tests using the default `yarn test` will run it through hardhat, it takes approximately 10 minutes on a good CPU.

The testing environment is unique. Make sure that `yarn typechain` has been run first, or else there could be typescript compilation issues.

The `test:fast` script makes use of the `parallel` tag, which will take up a considerable amount of CPU power. It makes the tests run faster.

In the `/test/shared/poolConfigs.ts` file is an array of different curve parameters. Each of these pools will go through the entire test suite.

**Note**: When running tests with parallel, the `swap` tests will not be logged. If the tests are frozen, it means the swap tests are the last tests to be run.

# Security

All audits are located in the `audits/` folder.
