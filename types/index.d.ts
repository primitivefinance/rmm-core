import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'

import * as ContractTypes from '../typechain'
import { DepositFunction } from '../test/unit/primitiveEngine/fixtures/depositFixture'
import { SwapFunction } from '../test/unit/primitiveEngine/fixtures/swapFixture'

export interface Functions {
  depositFunction: DepositFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
}

export interface Contracts {
  engine: ContractTypes.PrimitiveEngine
  house: ContractTypes.PrimitiveHouse
  factory: ContractTypes.PrimitiveFactory
  risky: ContractTypes.Token
  stable: ContractTypes.Token
  engineCreate: ContractTypes.EngineCreate
  engineDeposit: ContractTypes.EngineDeposit
  engineSwap: ContractTypes.EngineSwap
}

export interface Mocks {
  risky: MockContract
  stable: MockContract
  engine: MockContract
  house: MockContract
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

type ContractName = 'engineCreate' | 'engineDeposit' | 'engineSwap'
