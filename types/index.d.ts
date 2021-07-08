import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'
import * as ContractTypes from '../typechain'
import { DepositFunction, SwapFunction } from '../test/unit/createEngineFunctions'

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
  flashBorrower: ContractTypes.FlashBorrower
}

export interface Mocks {
  risky: MockContract
  stable: MockContract
  engine: MockContract
  factory: MockContract
}

declare module 'mocha' {
  export interface Context {
    signers: Wallet[]
    contracts: Contracts
    functions: Functions
    mocks: Mocks
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
  | 'flashBorrower'
