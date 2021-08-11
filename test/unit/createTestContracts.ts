import hre, { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { Contracts, ContractName } from '../../types'
import { deployContract } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { abi as MockEngineAbi } from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

type BaseContracts = {
  factory: ContractTypes.MockFactory
  engine: ContractTypes.MockEngine
  risky: ContractTypes.Token
  stable: ContractTypes.Token
}

export async function deploy(contractName: string, deployer: Wallet): Promise<Contract> {
  const artifact = await hre.artifacts.readArtifact(contractName)
  const contract = await deployContract(deployer, artifact, [], { gasLimit: 9500000 })
  return contract
}

async function initializeTestContract<T extends Contract>(contract: T, loadedContracts: any): Promise<void> {
  await contract.initialize(loadedContracts.engine.address, loadedContracts.risky.address, loadedContracts.stable.address)
}

export async function initializeBaseContracts(deployer: Wallet): Promise<BaseContracts> {
  const risky = (await deploy('Token', deployer)) as ContractTypes.Token
  const stable = (await deploy('Token', deployer)) as ContractTypes.Token
  const factory = (await deploy('MockFactory', deployer)) as ContractTypes.MockFactory
  await factory.deploy(risky.address, stable.address)
  const addr = await factory.getEngine(risky.address, stable.address)
  const engine = (await ethers.getContractAt(MockEngineAbi, addr)) as unknown as ContractTypes.MockEngine
  return { factory, engine, stable, risky }
}

export default async function createTestContracts(contracts: ContractName[], deployer: Wallet): Promise<Contracts> {
  const loadedContracts: Contracts = {} as Contracts

  const { factory, engine, risky, stable } = await initializeBaseContracts(deployer)

  loadedContracts.factory = factory
  loadedContracts.engine = engine
  loadedContracts.risky = risky
  loadedContracts.stable = stable

  for (let i = 0; i < contracts.length; i += 1) {
    const contractName = contracts[i]

    switch (contractName) {
      case 'engineSwap':
        loadedContracts.engineSwap = (await deploy('EngineSwap', deployer)) as ContractTypes.EngineSwap
        await initializeTestContract(loadedContracts.engineSwap, loadedContracts)
        break
      case 'engineCreate':
        loadedContracts.engineCreate = (await deploy('EngineCreate', deployer)) as ContractTypes.EngineCreate
        await initializeTestContract(loadedContracts.engineCreate, loadedContracts)
        break
      case 'engineDeposit':
        loadedContracts.engineDeposit = (await deploy('EngineDeposit', deployer)) as ContractTypes.EngineDeposit
        await initializeTestContract(loadedContracts.engineDeposit, loadedContracts)
        break
      case 'engineWithdraw':
        loadedContracts.engineWithdraw = (await deploy('EngineWithdraw', deployer)) as ContractTypes.EngineWithdraw
        await initializeTestContract(loadedContracts.engineWithdraw, loadedContracts)
        break
      case 'engineAllocate':
        loadedContracts.engineAllocate = (await deploy('EngineAllocate', deployer)) as ContractTypes.EngineAllocate
        await initializeTestContract(loadedContracts.engineAllocate, loadedContracts)
        break
      case 'engineRemove':
        loadedContracts.engineRemove = (await deploy('EngineRemove', deployer)) as ContractTypes.EngineRemove
        await initializeTestContract(loadedContracts.engineRemove, loadedContracts)
        break
      case 'engineSupply':
        loadedContracts.engineSupply = (await deploy('EngineSupply', deployer)) as ContractTypes.EngineSupply
        await initializeTestContract(loadedContracts.engineSupply, loadedContracts)
        break
      case 'engineBorrow':
        loadedContracts.engineBorrow = (await deploy('EngineBorrow', deployer)) as ContractTypes.EngineBorrow
        await initializeTestContract(loadedContracts.engineBorrow, loadedContracts)
        break
      case 'engineRepay':
        loadedContracts.engineRepay = (await deploy('EngineRepay', deployer)) as ContractTypes.EngineRepay
        await initializeTestContract(loadedContracts.engineRepay, loadedContracts)
        break
      case 'factoryDeploy':
        loadedContracts.factoryDeploy = (await deploy('FactoryDeploy', deployer)) as ContractTypes.FactoryDeploy
        await loadedContracts.factoryDeploy.initialize(loadedContracts.factory.address)
        break
      case 'testReserve':
        loadedContracts.testReserve = (await deploy('TestReserve', deployer)) as ContractTypes.TestReserve
        break
      case 'testMargin':
        loadedContracts.testMargin = (await deploy('TestMargin', deployer)) as ContractTypes.TestMargin
        break
      case 'testPosition':
        loadedContracts.testPosition = (await deploy('TestPosition', deployer)) as ContractTypes.TestPosition
        break
      case 'testReplicationMath':
        loadedContracts.testReplicationMath = (await deploy(
          'TestReplicationMath',
          deployer
        )) as ContractTypes.TestReplicationMath
        break
      case 'testBlackScholes':
        loadedContracts.testBlackScholes = (await deploy('TestBlackScholes', deployer)) as ContractTypes.TestBlackScholes
        break
      case 'testCumulativeNormalDistribution':
        loadedContracts.testCumulativeNormalDistribution = (await deploy(
          'TestCumulativeNormalDistribution',
          deployer
        )) as ContractTypes.TestCumulativeNormalDistribution
        break
      case 'badEngineDeposit':
        loadedContracts.badEngineDeposit = (await deploy('BadEngineDeposit', deployer)) as ContractTypes.BadEngineDeposit
        await initializeTestContract(loadedContracts.badEngineDeposit, loadedContracts)
        break
      case 'reentrancyAttacker':
        loadedContracts.reentrancyAttacker = (await deploy(
          'ReentrancyAttacker',
          deployer
        )) as ContractTypes.ReentrancyAttacker
        await initializeTestContract(loadedContracts.reentrancyAttacker, loadedContracts)
        break
      default:
        throw new Error(`Unknown contract name: ${contractName}`)
    }
  }

  return loadedContracts
}
