import { Wallet } from 'ethers'
import { MockContract } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

import { DepositFunction } from '../test/unit/primitiveEngine/fixtures/depositFixture'
import { SwapFunction } from '../test/unit/primitiveEngine/fixtures/swapFixture'

import {
  EngineAllocate,
  EngineCreate,
  EngineDeposit,
  EngineSwap,
  PrimitiveEngine,
  PrimitiveFactory,
  PrimitiveHouse,
} from '../typechain'

interface EngineFunctions {
  depositFunction: DepositFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
}

export interface Contracts {
  primitiveEngine: PrimitiveEngine
  house: PrimitiveHouse
  primitiveFactory: PrimitiveFactory
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
    contracts: Contracts & EngineFunctions
    mocks: Mocks
  }
}
