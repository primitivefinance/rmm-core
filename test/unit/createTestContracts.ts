import hre, { ethers } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { Contracts, ContractName } from '../../types'
import { deployContract } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { abi as PrimitiveEngineAbi } from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'

async function deploy(contractName: string, deployer: Wallet): Promise<Contract> {
  const artifact = await hre.artifacts.readArtifact(contractName)
  const contract = await deployContract(deployer, artifact)
  return contract
}

async function initializeTestContract<T extends Contract>(contract: T, loadedContracts: any): Promise<void> {
  await contract.initialize(loadedContracts.engine.address, loadedContracts.risky.address, loadedContracts.stable.address)
}

async function initializeEngineContract(
  factory: ContractTypes.PrimitiveFactory,
  risky: ContractTypes.Token,
  stable: ContractTypes.Token
): Promise<ContractTypes.PrimitiveEngine> {
  await factory.create(risky.address, stable.address)
  const addr = await factory.getEngine(risky.address, stable.address)
  return ((await ethers.getContractAt(PrimitiveEngineAbi, addr)) as unknown) as ContractTypes.PrimitiveEngine
}

export default async function createTestContracts(contracts: ContractName[], deployer: Wallet): Promise<Contracts> {
  const loadedContracts: Contracts = {} as Contracts
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
      case 'factory':
        loadedContracts.factory = (await deploy('PrimitiveFactory', deployer)) as ContractTypes.PrimitiveFactory
        break
      case 'tokens':
        loadedContracts.risky = (await deploy('Token', deployer)) as ContractTypes.Token
        loadedContracts.stable = (await deploy('Token', deployer)) as ContractTypes.Token
        break
      case 'engine':
        loadedContracts.engine = await initializeEngineContract(
          loadedContracts.factory,
          loadedContracts.risky,
          loadedContracts.stable
        )
        break
      default:
        throw new Error(`Unknown contract name: ${contractName}`)
    }
  }

  return loadedContracts
}
