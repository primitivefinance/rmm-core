import hre, { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { Contracts, Libraries, EngineTypes } from '../../types'
import { abi as MockEngineAbi } from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'
import { batchApproval } from './utils'

type DefaultContracts = {
  factory: ContractTypes.MockFactory
  engine: ContractTypes.MockEngine
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
}

export async function deploy(contractName: string, deployer: Wallet, args: any[] = []): Promise<Contract> {
  const artifact = await hre.artifacts.readArtifact(contractName)
  const contract = await deployContract(deployer, artifact, args, { gasLimit: 9500000 })
  return contract
}

export async function deployToken(deployer: Wallet, decimals: number): Promise<ContractTypes.TestToken> {
  const token = (await deploy('TestToken', deployer, ['Test', 'Token', decimals])) as ContractTypes.TestToken
  return token
}

export async function deployEngine(
  factory: ContractTypes.MockFactory,
  token0: ContractTypes.TestToken,
  token1: ContractTypes.TestToken
): Promise<ContractTypes.MockEngine> {
  await factory.deploy(token0.address, token1.address)
  const addr = await factory.getEngine(token0.address, token1.address)
  const engine = (await ethers.getContractAt(MockEngineAbi, addr)) as unknown as ContractTypes.MockEngine
  return engine
}

export async function defaultContracts(deployer: Wallet): Promise<DefaultContracts> {
  const factory = (await deploy('MockFactory', deployer)) as ContractTypes.MockFactory
  const risky = await deployToken(deployer, 18)
  const stable = await deployToken(deployer, 18)
  const engine = await deployEngine(factory, risky, stable)
  return { factory, engine, stable, risky }
}

export interface CreateEngine {
  engine: ContractTypes.MockEngine
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
}

export interface TestContracts {
  contracts: Contracts
  createEngine: (decimalsRisky, decimalsStable) => Promise<CreateEngine>
}

export async function createTestContracts(deployer: Wallet): Promise<TestContracts> {
  const contracts: Contracts = {} as Contracts

  const { factory, engine, risky, stable } = await defaultContracts(deployer)

  contracts.factory = factory
  contracts.engine = engine
  contracts.risky = risky
  contracts.stable = stable

  contracts.router = (await deploy('TestRouter', deployer, [engine.address])) as ContractTypes.TestRouter

  contracts.factoryDeploy = (await deploy('FactoryDeploy', deployer)) as ContractTypes.FactoryDeploy
  await contracts.factoryDeploy.initialize(contracts.factory.address)

  const contractAddresses = Object.keys(contracts).map((key) => contracts[key]?.address)
  await batchApproval(contractAddresses, [risky, stable], deployer)

  async function createEngine(decimalsRisky, decimalsStable, debug = false): Promise<CreateEngine> {
    if (debug) {
      console.log(`\n Creating Engine with...`)
      console.log(`     - Risky Decimals ${decimalsRisky}`)
      console.log(`     - Stable Decimals ${decimalsStable}`)
    }
    const risky = await deployToken(deployer, decimalsRisky)
    const stable = await deployToken(deployer, decimalsStable)
    const engine = await deployEngine(factory, risky, stable)
    await batchApproval(contractAddresses.push(engine.address), [risky, stable], deployer)
    return { engine, risky, stable }
  }

  return { contracts, createEngine }
}

export interface PrimitiveFixture extends TestContracts {}

export async function primitiveFixture([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> {
  return await createTestContracts(wallet)
}

export function customDecimalsFixture(
  decimalsRisky: number,
  decimalsStable: number
): ([wallet]: Wallet[], provider: any) => Promise<PrimitiveFixture> {
  async function fixture([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> {
    let fix = await primitiveFixture([wallet], provider)
    // if using a custom engine, create it and replace the default contracts
    if (decimalsRisky != 18 || decimalsStable != 18) {
      const { risky, stable, engine } = await fix.createEngine(decimalsRisky, decimalsStable)
      fix.contracts.risky = risky
      fix.contracts.stable = stable
      fix.contracts.engine = engine
      await fix.contracts.router.setEngine(engine.address) // set the router's engine
    }

    return fix
  }

  return fixture
}

export async function createTestLibraries(deployer: Wallet): Promise<Libraries> {
  const libraries: Libraries = {} as Libraries

  libraries.testReserve = (await deploy('TestReserve', deployer)) as ContractTypes.TestReserve

  libraries.testMargin = (await deploy('TestMargin', deployer)) as ContractTypes.TestMargin

  libraries.testReplicationMath = (await deploy('TestReplicationMath', deployer)) as ContractTypes.TestReplicationMath

  libraries.testCumulativeNormalDistribution = (await deploy(
    'TestCumulativeNormalDistribution',
    deployer
  )) as ContractTypes.TestCumulativeNormalDistribution

  return libraries
}

export interface LibraryFixture {
  libraries: Libraries
}

export async function libraryFixture([wallet]: Wallet[], provider: any): Promise<LibraryFixture> {
  return { libraries: await createTestLibraries(wallet) }
}
