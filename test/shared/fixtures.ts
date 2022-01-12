import hre, { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { deployContract, Fixture } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { Contracts, Libraries, EngineTypes } from '../../types'
import MockEngineArtifact from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'
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
  const engine = (await ethers.getContractAt(MockEngineArtifact.abi, addr)) as unknown as ContractTypes.MockEngine
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

interface FactoryFixture {
  factory: ContractTypes.MockFactory
}

async function factoryFixture(): Promise<FactoryFixture> {
  const factoryFactory = await ethers.getContractFactory('MockFactory')
  const factory = (await factoryFactory.deploy()) as ContractTypes.MockFactory
  return { factory }
}

interface TokensFixture {
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
}

async function tokensFixture(decimalsRisky: number, decimalsStable: number): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('TestToken')
  const risky = (await tokenFactory.deploy('Test Risky 0', 'RISKY0', decimalsRisky)) as ContractTypes.TestToken
  const stable = (await tokenFactory.deploy('Test Stable 1', 'STABLE1', decimalsStable)) as ContractTypes.TestToken

  return { risky, stable }
}

export interface EngineFixture {
  factory: ContractTypes.MockFactory
  factoryDeploy: ContractTypes.FactoryDeploy
  router: ContractTypes.TestRouter
  createEngine(
    decimalsRisky: number,
    decimalsStable: number
  ): Promise<{ engine: ContractTypes.MockEngine; risky: ContractTypes.TestToken; stable: ContractTypes.TestToken }>
}

export const engineFixture: Fixture<EngineFixture> = async function (): Promise<EngineFixture> {
  const { factory } = await factoryFixture()

  const factoryDeployFactory = await ethers.getContractFactory('FactoryDeploy')

  const factoryDeploy = (await factoryDeployFactory.deploy()) as ContractTypes.FactoryDeploy
  const tx = await factoryDeploy.initialize(factory.address)
  await tx.wait()

  const routerContractFactory = await ethers.getContractFactory('TestRouter')

  // The engine MUST be set in the router, once one has been deployed
  const router = (await routerContractFactory.deploy(ethers.constants.AddressZero)) as ContractTypes.TestRouter

  return {
    factory,
    factoryDeploy,
    router,
    createEngine: async (decimalsRisky: number, decimalsStable: number) => {
      const { risky, stable } = await tokensFixture(decimalsRisky, decimalsStable)
      const tx = await factory.deploy(risky.address, stable.address)
      await tx.wait()
      const addr = await factory.getEngine(risky.address, stable.address)
      const engine = (await ethers.getContractAt(MockEngineArtifact.abi, addr)) as unknown as ContractTypes.MockEngine
      await router.setEngine(engine.address)
      return { engine, risky, stable }
    },
  }
}

export const librariesFixture: Fixture<LibraryFixture> = async function (): Promise<LibraryFixture> {
  const libraries: Libraries = {} as Libraries

  const reserveFactory = await ethers.getContractFactory('TestReserve')
  const marginFactory = await ethers.getContractFactory('TestMargin')
  const replicationFactory = await ethers.getContractFactory('TestReplicationMath')
  const cdfFactory = await ethers.getContractFactory('TestCumulativeNormalDistribution')

  libraries.testReserve = (await reserveFactory.deploy()) as ContractTypes.TestReserve

  libraries.testMargin = (await marginFactory.deploy()) as ContractTypes.TestMargin

  libraries.testReplicationMath = (await replicationFactory.deploy()) as ContractTypes.TestReplicationMath

  libraries.testCumulativeNormalDistribution =
    (await cdfFactory.deploy()) as ContractTypes.TestCumulativeNormalDistribution

  return { libraries }
}
