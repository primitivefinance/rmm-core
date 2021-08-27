import { Wallet, BigNumber } from 'ethers'
import * as ContractTypes from '../typechain'
import { Calibration } from '../test/shared/calibration'

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
  engineSupply: ContractTypes.EngineSupply
  engineBorrow: ContractTypes.EngineBorrow
  engineRepay: ContractTypes.EngineRepay
  badEngineDeposit: ContractTypes.BadEngineDeposit
  factoryDeploy: ContractTypes.FactoryDeploy
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testPosition: ContractTypes.TestPosition
  testReplicationMath: ContractTypes.TestReplicationMath
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
  reentrancyAttacker: ContractTypes.ReentrancyAttacker
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
  | 'testCumulativeNormalDistribution'
  | 'engineRemove'
  | 'engineSupply'
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
        account: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      decreaseMargin(
        engine: ContractTypes.PrimitiveEngine,
        account: string,
        risky: BigNumber,
        stable: BigNumber
      ): AsyncAssertion
      increasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      decreasePositionFloat(engine: ContractTypes.PrimitiveEngine, posId: string, float: BigNumber): AsyncAssertion
      increasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      decreasePositionLiquidity(engine: ContractTypes.PrimitiveEngine, posId: string, liquidity: BigNumber): AsyncAssertion
      increasePositionDebt(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        riskyCollateral: BigNumber,
        stableCollateral: BigNumber
      ): AsyncAssertion
      decreasePositionDebt(
        engine: ContractTypes.PrimitiveEngine,
        posId: string,
        riskyCollateral: BigNumber,
        stableCollateral: BigNumber
      ): AsyncAssertion
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
