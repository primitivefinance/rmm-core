import { BigNumberish } from '../shared/Units'
import { constants, Wallet, Transaction, BytesLike } from 'ethers'
import { Contracts, Functions, ContractName } from '../../types'

const empty: BytesLike = constants.HashZero

export default function createEngineFunctions(
  contracts: ContractName[],
  loadedContracts: Contracts,
  deployer: Wallet
): Functions {
  const loadedFunctions: Functions = {} as Functions
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
          return loadedContracts.engineSwap.swap(pid, addXRemoveY, deltaOut, deltaInMax, fromMargin, empty)
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
      case 'engineWithdraw':
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
          return loadedContracts.engineDeposit.deposit(deployer.address, deltaX, deltaY, empty)
        }
        break
      default:
        break
    }
  }
  return loadedFunctions
}
