import { Wallet, BigNumber } from 'ethers'
import { Calibration } from '../test/shared/calibration'
import * as ContractTypes from '../typechain'
import { Fixture } from '@ethereum-waffle/provider'

export interface Contracts {
  engine: ContractTypes.MockEngine
  factory: ContractTypes.MockFactory
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
  router: ContractTypes.TestRouter
  factoryDeploy: ContractTypes.FactoryDeploy
  testReserve: ContractTypes.TestReserve
  testMargin: ContractTypes.TestMargin
  testPosition: ContractTypes.TestPosition
  testReplicationMath: ContractTypes.TestReplicationMath
  testCumulativeNormalDistribution: ContractTypes.TestCumulativeNormalDistribution
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
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>
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

export type EngineTypes = ContractTypes.PrimitiveEngine | ContractTypes.MockEngine

declare global {
  export namespace Chai {
    interface Assertion {
      revertWithCustomError(errorName: string, params: any[]): AsyncAssertion
      increaseMargin(engine: EngineTypes, account: string, risky: BigNumber, stable: BigNumber): AsyncAssertion
      decreaseMargin(engine: EngineTypes, account: string, risky: BigNumber, stable: BigNumber): AsyncAssertion
      increasePositionFloat(engine: EngineTypes, posId: string, float: BigNumber): AsyncAssertion
      decreasePositionFloat(engine: EngineTypes, posId: string, float: BigNumber): AsyncAssertion
      increasePositionLiquidity(engine: EngineTypes, posId: string, liquidity: BigNumber): AsyncAssertion
      decreasePositionLiquidity(engine: EngineTypes, posId: string, liquidity: BigNumber): AsyncAssertion
      increasePositionDebt(
        engine: EngineTypes,
        posId: string,
        collateralRisky: BigNumber,
        collateralStable: BigNumber
      ): AsyncAssertion
      decreasePositionDebt(
        engine: EngineTypes,
        posId: string,
        collateralRisky: BigNumber,
        collateralStable: BigNumber
      ): AsyncAssertion
      increasePositionFeeRiskyGrowthLast(engine: EngineTypes, posId: string, amount: BigNumber): AsyncAssertion
      increasePositionFeeStableGrowthLast(engine: EngineTypes, posId: string, amount: BigNumber): AsyncAssertion
      increaseReserveRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveLiquidity(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFloat(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveFloat(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveCollateralRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveCollateralRisky(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveCollateralStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      decreaseReserveCollateralStable(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFeeRiskyGrowth(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
      increaseReserveFeeStableGrowth(engine: EngineTypes, poolId: string, amount: BigNumber): AsyncAssertion
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
    }
  }
}
