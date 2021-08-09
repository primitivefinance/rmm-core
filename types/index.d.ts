import { Wallet, BigNumber } from 'ethers'
import { MockContract } from 'ethereum-waffle'
import * as ContractTypes from '../typechain'
import { DepositFunction, SwapFunction } from '../test/unit/createEngineFunctions'
import { Config } from '../test/unit/config'

export interface Functions {
  depositFunction: DepositFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
}

export interface Contracts {
  engine: ContractTypes.MockEngine
  factory: ContractTypes.MockFactory
  risky: ContractTypes.Token
  stable: ContractTypes.Token
  engineCreate: ContractTypes.EngineCreate
  engineDeposit: ContractTypes.EngineDeposit
  engineWithdraw: ContractTypes.EngineWithdraw
  engineSwap: ContractTypes.EngineSwap
  engineAllocate: ContractTypes.EngineAllocate
  engineRemove: ContractTypes.EngineRemove
  engineLend: ContractTypes.EngineLend
  engineBorrow: ContractTypes.EngineBorrow
  engineRepay: ContractTypes.EngineRepay
  badEngineDeposit: ContractTypes.BadEngineDeposit
  factoryDeploy: ContractTypes.FactoryDeploy
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testPosition: ContractTypes.TestPosition
  testReplicationMath: ContractTypes.TestReplicationMath
  testBlackScholes: ContractTypes.TestBlackScholes
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
  reentrancyAttacker: ContractTypes.ReentrancyAttacker
}

export interface Mocks {
  risky: MockContract
  stable: MockContract
  engine: MockContract
  factory: MockContract
}

export interface Configs {
  all: Config[]
  strikes: Config[]
  sigmas: Config[]
  maturities: Config[]
  spots: Config[]
}

declare module 'mocha' {
  export interface Context {
    signers: Wallet[]
    contracts: Contracts
    functions: Functions
    mocks: Mocks
    configs: Configs
  }
}

type ContractName =
  | 'engineCreate'
  | 'engineDeposit'
  | 'engineSwap'
  | 'engineWithdraw'
  | 'engineAllocate'
  | 'factoryCreate'
  | 'factoryDeploy'
  | 'testReserve'
  | 'testMargin'
  | 'testPosition'
  | 'testReplicationMath'
  | 'testBlackScholes'
  | 'testCumulativeNormalDistribution'
  | 'engineRemove'
  | 'engineLend'
  | 'engineBorrow'
  | 'engineRepay'
  | 'badEngineDeposit'
  | 'reentrancyAttacker'

declare global {
  export namespace Chai {
    interface Assertion {
      revertWithCustomError(errorName: string, params: any[]): AsyncAssertion
      increaseMargin(
        engine: ContractTypes.PrimitiveEngine,
        owner: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      decreaseMargin(
        engine: ContractTypes.PrimitiveEngine,
        owner: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      increasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      decreasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      increasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      decreasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      increasePositionDebt(engine: ContractTypes.PrimitiveEngine, posId: string, debt: BigNumber): AsyncAssertion
      decreasePositionDebt(engine: ContractTypes.PrimitiveEngine, posId: string, debt: BigNumber): AsyncAssertion
      increaseReserveRisky(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveRisky(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveStable(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveStable(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveLiquidity(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveLiquidity(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFloat(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveFloat(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveDebt(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveDebt(engine: ContractTypes.PrimitiveEngine, poolId: string, amount: BigNumber): AsyncAssertion
      updateReserveBlockTimestamp(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativeRisky(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
      updateReserveCumulativeStable(
        engine: ContractTypes.PrimitiveEngine,
        poolId: string,
        amount: BigNumber,
        blockTimestamp: number
      ): AsyncAssertion
    }
  }
}
