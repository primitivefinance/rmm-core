import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'

import { PrimitiveEngine, PrimitiveFactory, PrimitiveHouse, Token } from '../typechain'

export interface Contracts {
  engine: PrimitiveEngine
  house: PrimitiveHouse
  factory: PrimitiveFactory
  risky: Token
  stable: Token
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
