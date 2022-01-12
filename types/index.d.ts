import { Wallet, BigNumber } from 'ethers'
import { Calibration } from '../test/shared/calibration'
import * as ContractTypes from '../typechain'
import { Fixture } from '@ethereum-waffle/provider'
import { SwapTestCase } from '../test/unit/primitiveEngine/effect/swap.test'
import { Wei } from 'web3-units'

export type Awaited<T> = T extends PromiseLike<infer U> ? U : T

export interface Libraries {
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testReplicationMath: ContractTypes.TestReplicationMath
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
}

export interface Contracts {
  engine: ContractTypes.MockEngine
  factory: ContractTypes.MockFactory
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
  router: ContractTypes.TestRouter
  factoryDeploy: ContractTypes.FactoryDeploy
}

export interface Configs {
  all: Calibration[]
  strikes: Calibration[]
  sigmas: Calibration[]
  maturities: Calibration[]
  spots: Calibration[]
}

declare module 'mocha' {
  export interface Context {
    signers: Wallet[]
    contracts: Contracts
    libraries: Libraries
    configs: Configs
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>
  }
}

type ContractName =
  | 'testRouter'
  | 'factoryCreate'
  | 'factoryDeploy'
  | 'testReserve'
  | 'testMargin'
  | 'testPosition'
  | 'testReplicationMath'
  | 'testCumulativeNormalDistribution'

export type EngineTypes = ContractTypes.PrimitiveEngine | ContractTypes.MockEngine

declare global {
  export namespace Chai {
    interface Assertion {
      revertWithCustomError(errorName: string, params?: any[], chainId?: number): AsyncAssertion
      increaseMargin(engine: EngineTypes, account: string, risky: BigNumber, stable: BigNumber): AsyncAssertion
      decreaseMargin(engine: EngineTypes, account: string, risky: BigNumber, stable: BigNumber): AsyncAssertion
      increasePositionLiquidity(
        engine: EngineTypes,
        account: string,
        poolId: string,
        liquidity: BigNumber
      ): AsyncAssertion
      decreasePositionLiquidity(
        engine: EngineTypes,
        account: string,
        poolId: string,
        liquidity: BigNumber
      ): AsyncAssertion
      increaseReserveRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      updateReserveBlockTimestamp(engine: EngineTypes, poolId: string, blockTimestamp: number): AsyncAssertion
      updateReserveCumulativeRisky(
        engine: EngineTypes,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativeStable(
        engine: EngineTypes,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion

      updateSpotPrice(engine: EngineTypes, cal: Calibration, riskyForStable: boolean): AsyncAssertion
      decreaseSwapOutBalance(
        engine: EngineTypes,
        tokens: any[],
        receiver: string,
        poolId: string,
        { riskyForStable, toMargin }: { riskyForStable: boolean; toMargin: boolean },
        amountOut?: Wei
      ): AsyncAssertion
      increaseInvariant(engine: EngineTypes, poolId: string): AsyncAssertion
    }
  }
}
