import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'

import * as ContractTypes from '../typechain'

interface Contracts {
  engine: ContractTypes.PrimitiveEngine
  house: ContractTypes.PrimitiveHouse
  factory: ContractTypes.PrimitiveFactory
  risky: ContractTypes.Token
  stable: ContractTypes.Token
  engineCreate: ContractTypes.TestEngineCreate
  engineDeposit: ContractTypes.TestEngineDeposit
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
    mocks: Mocks
  }
}
