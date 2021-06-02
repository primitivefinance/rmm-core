import hre from 'hardhat'
import { deployMockContract, MockContract } from 'ethereum-waffle'
import { Wallet } from 'ethers'

import {
  PrimitiveEngine,
  PrimitiveEngine__factory,
  PrimitiveFactory,
  PrimitiveFactory__factory,
  PrimitiveHouse,
  PrimitiveHouse__factory,
} from '../../typechain'

export type PrimitiveEngineFixture = {
  primitiveEngine: PrimitiveEngine
  primitiveFactory: MockContract
}

export async function primitiveEngineFixture(signers: Wallet[]): Promise<PrimitiveEngineFixture> {
  const [deployer] = signers

  // TODO: Find a way to use TypeChain to load the ABI
  const primiveFactoryArtifact = await hre.artifacts.readArtifact('PrimitiveFactory')
  const primitiveFactory = await deployMockContract(deployer, primiveFactoryArtifact.abi)

  primitiveFactory.mock.args.returns({
    factory: '',
    risky: '',
    stable: '',
  })

  const primitiveEngine = await new PrimitiveEngine__factory(deployer).deploy()

  return {
    primitiveEngine,
    primitiveFactory,
  }
}

export type PrimitiveFactoryFixture = {
  primitiveFactory: PrimitiveFactory
  signers: Wallet[]
  risky: MockContract
  stable: MockContract
}

export async function primitiveFactoryFixture(signers: Wallet[]): Promise<PrimitiveFactoryFixture> {
  const [deployer] = signers
  const primitiveFactory = await new PrimitiveFactory__factory(deployer).deploy()

  const erc20Artifact = await hre.artifacts.readArtifact('ERC20')

  const risky = await deployMockContract(deployer, erc20Artifact.abi)
  const stable = await deployMockContract(deployer, erc20Artifact.abi)

  return {
    primitiveFactory,
    signers,
    risky,
    stable,
  }
}

export type PrimitiveHouseFixture = {
  primitiveFactory: MockContract
  primitiveEngine: PrimitiveEngine
  primitiveHouse: PrimitiveHouse
  signers: Wallet[]
  risky: MockContract
  stable: MockContract
}

export async function primitiveHouseFixture(signers: Wallet[]): Promise<PrimitiveHouseFixture> {
  const [deployer] = signers

  // TODO: Find a way to use TypeChain to load the ABI
  const primiveFactoryArtifact = await hre.artifacts.readArtifact('PrimitiveFactory')
  const primitiveFactory = await deployMockContract(deployer, primiveFactoryArtifact.abi)

  primitiveFactory.mock.args.returns({
    factory: '',
    risky: '',
    stable: '',
  })

  // TODO: Add univ3 pool
  const primitiveEngine = await new PrimitiveEngine__factory(deployer).deploy()
  const primitiveHouse = await new PrimitiveHouse__factory(deployer).deploy()

  const erc20Artifact = await hre.artifacts.readArtifact('ERC20')

  const risky = await deployMockContract(deployer, erc20Artifact.abi)
  const stable = await deployMockContract(deployer, erc20Artifact.abi)

  return {
    primitiveEngine,
    primitiveFactory,
    primitiveHouse,
    signers,
    risky,
    stable,
  }
}
