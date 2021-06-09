import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import {
  EngineAllocate,
  EngineCreate,
  EngineDeposit,
  EngineSwap,
  PrimitiveEngine,
  PrimitiveFactory,
  PrimitiveHouse,
} from '../typechain'

export interface Contracts {
  engine: PrimitiveEngine
  house: PrimitiveHouse
  factory: PrimitiveFactory
  swap: EngineSwap
  deposit: EngineDeposit
  allocate: EngineAllocate
  create: EngineCreate
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
