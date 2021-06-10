import hre, { ethers } from 'hardhat'
import { createFixtureLoader, MockProvider } from 'ethereum-waffle'
import { Contracts, Functions, Mocks } from '../../types'
import { BigNumberish } from '../shared/Units'
import { constants, Contract, Wallet, Transaction, BytesLike } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import * as ContractTypes from '../../typechain'
import { abi as PrimitiveEngineAbi } from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'

async function deploy(contractName: string, deployer: Wallet): Promise<Contract> {
  const artifact = await hre.artifacts.readArtifact(contractName)
  const contract = await deployContract(deployer, artifact)
  return contract
}

type ContractName = 'factory' | 'risky' | 'stable' | 'engineCreate' | 'engineDeposit' | 'engineSwap' | 'engine'

export default async function loadContext(
  provider: MockProvider,
  contracts: ContractName[],
  action?: (signers: Wallet[], contracts: Contracts) => void
): Promise<void> {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(async function (signers: Wallet[]) {
      const [deployer] = signers
      const loadedContracts: Contracts = {} as Contracts
      const loadedFunctions: Functions = {} as Functions

      for (let i = 0; i < contracts.length; i += 1) {
        const contractName = contracts[i]

        switch (contractName) {
          case 'engineSwap':
            loadedContracts.engineSwap = (await deploy('EngineSwap', deployer)) as ContractTypes.EngineSwap
            await loadedContracts.engineSwap.initialize(
              loadedContracts.engine.address,
              loadedContracts.risky.address,
              loadedContracts.stable.address
            )
            break
          case 'engineCreate':
            loadedContracts.engineCreate = (await deploy('EngineCreate', deployer)) as ContractTypes.EngineCreate
            await loadedContracts.engineCreate.initialize(
              loadedContracts.engine.address,
              loadedContracts.risky.address,
              loadedContracts.stable.address
            )
            break
          case 'engineDeposit':
            loadedContracts.engineDeposit = (await deploy('EngineDeposit', deployer)) as ContractTypes.EngineDeposit
            await loadedContracts.engineDeposit.initialize(
              loadedContracts.engine.address,
              loadedContracts.risky.address,
              loadedContracts.stable.address
            )
            loadedFunctions.depositFunction = async (
              deltaX: BigNumberish,
              deltaY: BigNumberish,
              from?: Wallet
            ): Promise<Transaction> => {
              if (from) {
                loadedContracts.risky.connect(from)
                loadedContracts.stable.connect(from)
                loadedContracts.engineDeposit.connect(from)
              }
              await loadedContracts.risky.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
              await loadedContracts.stable.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
              return loadedContracts.engineDeposit.deposit(deployer.address, deltaX, deltaY)
            }
            break
          case 'factory':
            loadedContracts.factory = (await deploy('PrimitiveFactory', deployer)) as ContractTypes.PrimitiveFactory
            break
          case 'risky':
            loadedContracts.risky = (await deploy('Token', deployer)) as ContractTypes.Token
            break
          case 'stable':
            loadedContracts.stable = (await deploy('Token', deployer)) as ContractTypes.Token
            break
          case 'engine':
            await loadedContracts.factory.create(loadedContracts.risky.address, loadedContracts.stable.address)
            const addr = await loadedContracts.factory.getEngine(
              loadedContracts.risky.address,
              loadedContracts.stable.address
            )

            const primitiveEngine = ((await ethers.getContractAt(
              PrimitiveEngineAbi,
              addr
            )) as unknown) as ContractTypes.PrimitiveEngine
            loadedContracts.engine = primitiveEngine
            break
          default:
            throw new Error(`Unknown contract name: ${contractName}`)
        }
      }

      for (let i = 0; i < contracts.length; i += 1) {
        const contractName = contracts[i]

        switch (contractName) {
          case 'engineSwap':
            const swapFunction = async (
              pid: BytesLike | string,
              addXRemoveY: boolean,
              deltaOut: BigNumberish,
              deltaInMax: BigNumberish,
              fromMargin: boolean
            ): Promise<Transaction> => {
              await loadedContracts.risky.approve(loadedContracts.engineSwap.address, constants.MaxUint256)
              await loadedContracts.stable.approve(loadedContracts.engineSwap.address, constants.MaxUint256)
              return loadedContracts.engineSwap.swap(pid, addXRemoveY, deltaOut, deltaInMax, fromMargin)
            }

            loadedFunctions.swapXForY = (
              pid: BytesLike,
              deltaOut: BigNumberish,
              deltaInMax: BigNumberish,
              fromMargin: boolean
            ) => {
              return swapFunction(pid, true, deltaOut, deltaInMax, fromMargin)
            }
            loadedFunctions.swapYForX = (
              pid: BytesLike,
              deltaOut: BigNumberish,
              deltaInMax: BigNumberish,
              fromMargin: boolean
            ) => {
              return swapFunction(pid, false, deltaOut, deltaInMax, fromMargin)
            }
            break
          case 'engineCreate':
            break
          case 'engineDeposit':
            loadedFunctions.depositFunction = async (
              deltaX: BigNumberish,
              deltaY: BigNumberish,
              from?: Wallet
            ): Promise<Transaction> => {
              if (from) {
                loadedContracts.risky.connect(from)
                loadedContracts.stable.connect(from)
                loadedContracts.engineDeposit.connect(from)
              }
              await loadedContracts.risky.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
              await loadedContracts.stable.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
              return loadedContracts.engineDeposit.deposit(deployer.address, deltaX, deltaY)
            }
            break
          default:
            break
        }
      }

      if (action) await action(signers, loadedContracts)

      return { contracts: loadedContracts, functions: loadedFunctions }
    })

    this.contracts = {} as Contracts
    this.functions = {} as Functions
    this.mocks = {} as Mocks
    this.signers = provider.getWallets()
    this.deployer = this.signers[0]

    Object.assign(this.contracts, loadedFixture.contracts)
    Object.assign(this.functions, loadedFixture.functions)
  })
}
