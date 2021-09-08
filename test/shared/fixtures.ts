import hre, { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { Contracts, ContractName, Libraries } from '../../types'
import { abi as MockEngineAbi } from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'
import { batchApproval } from './utils'

type BaseContracts = {
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

async function initializeTestContract<T extends Contract>(contract: T, loadedContracts: any): Promise<void> {
  await contract.initialize(loadedContracts.engine.address, loadedContracts.risky.address, loadedContracts.stable.address)
}

export async function initializeBaseContracts(deployer: Wallet): Promise<BaseContracts> {
  const risky = (await deploy('TestToken', deployer, ['Risky', 'Risky', 18])) as ContractTypes.TestToken
  const stable = (await deploy('TestToken', deployer, ['Stable', 'Stable', 18])) as ContractTypes.TestToken
  const factory = (await deploy('MockFactory', deployer)) as ContractTypes.MockFactory
  await factory.deploy(risky.address, stable.address)
  const addr = await factory.getEngine(risky.address, stable.address)
  const engine = (await ethers.getContractAt(MockEngineAbi, addr)) as unknown as ContractTypes.MockEngine
  return { factory, engine, stable, risky }
}

export async function createTestContracts(deployer: Wallet): Promise<Contracts> {
  const contracts: Contracts = {} as Contracts

  const { factory, engine, risky, stable } = await initializeBaseContracts(deployer)

  contracts.factory = factory
  contracts.engine = engine
  contracts.risky = risky
  contracts.stable = stable

  contracts.router = (await deploy('TestRouter', deployer, [engine.address])) as ContractTypes.TestRouter

  contracts.factoryDeploy = (await deploy('FactoryDeploy', deployer)) as ContractTypes.FactoryDeploy
  await contracts.factoryDeploy.initialize(contracts.factory.address)

  const contractAddresses = Object.keys(contracts).map((key) => contracts[key]?.address)
  await batchApproval(contractAddresses, [risky, stable], deployer)

  return contracts
}

export interface PrimitiveFixture {
  contracts: Contracts
}

export async function primitiveFixture([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> {
  return { contracts: await createTestContracts(wallet) }
}

export async function createTestLibraries(deployer: Wallet): Promise<Libraries> {
  const libraries: Libraries = {} as Libraries

  libraries.testPosition = (await deploy('TestPosition', deployer)) as ContractTypes.TestPosition
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
