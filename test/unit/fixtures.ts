import hre, { ethers } from 'hardhat'
import { deployMockContract, MockContract, deployContract } from 'ethereum-waffle'
import { constants, Contract, Wallet, Signer } from 'ethers'
import { abi as PrimitiveEngineAbi } from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'

import { Token, PrimitiveEngine, PrimitiveFactory, PrimitiveHouse } from '../../typechain'

export type PrimitiveEngineFixture = {
  primitiveFactory: PrimitiveFactory
  primitiveEngine: PrimitiveEngine
  signers: Wallet[]
  risky: Token
  stable: Token
}

export async function primitiveEngineFixture(signers: Wallet[]): Promise<PrimitiveEngineFixture> {
  const risky = ((await (await ethers.getContractFactory('Token')).deploy()) as unknown) as Token
  const stable = ((await (await ethers.getContractFactory('Token')).deploy()) as unknown) as Token

  const primitiveFactory = ((await (
    await ethers.getContractFactory('PrimitiveFactory')
  ).deploy()) as unknown) as PrimitiveFactory

  await primitiveFactory.create(risky.address, stable.address)
  const addr = await primitiveFactory.getEngine(risky.address, stable.address)

  const primitiveEngine = ((await ethers.getContractAt(PrimitiveEngineAbi, addr)) as unknown) as PrimitiveEngine

  return {
    primitiveFactory,
    primitiveEngine,
    signers,
    risky,
    stable,
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

  const primitiveFactoryArtifact = await hre.artifacts.readArtifact('PrimitiveFactory')
  const primitiveFactory = await deployContract(
    deployer,
    primitiveFactoryArtifact
  ) as PrimitiveFactory

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
  primitiveFactory: PrimitiveFactory
  primitiveEngine: PrimitiveEngine
  primitiveHouse: PrimitiveHouse
  signers: Wallet[]
  risky: Token
  stable: Token
}

export async function primitiveHouseFixture(signers: Wallet[]): Promise<PrimitiveHouseFixture> {
  const risky = ((await (await ethers.getContractFactory('Token')).deploy()) as unknown) as Token
  const stable = ((await (await ethers.getContractFactory('Token')).deploy()) as unknown) as Token

  const primitiveFactory = ((await (
    await ethers.getContractFactory('PrimitiveFactory')
  ).deploy()) as unknown) as PrimitiveFactory

  await primitiveFactory.create(risky.address, stable.address)
  const addr = await primitiveFactory.getEngine(risky.address, stable.address)

  const primitiveEngine = ((await ethers.getContractAt(PrimitiveEngineAbi, addr)) as unknown) as PrimitiveEngine

  const primitiveHouse = ((await (await ethers.getContractFactory('PrimitiveHouse')).deploy()) as unknown) as PrimitiveHouse

  return {
    primitiveEngine,
    primitiveFactory,
    primitiveHouse,
    signers,
    risky,
    stable,
  }
}
