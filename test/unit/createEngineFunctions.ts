import { BigNumberish, constants, Wallet, Transaction, BytesLike } from 'ethers'
import { Contracts, Functions, ContractName } from '../../types'

const empty: BytesLike = constants.HashZero
export type DepositFunction = (delRisky: BigNumberish, delStable: BigNumberish, from?: Wallet) => Promise<Transaction>
export type SwapFunction = (
  poolId: BytesLike | string,
  addXRemoveY: boolean,
  deltaOut: BigNumberish,
  deltaInMax: BigNumberish,
  fromMargin: boolean
) => Promise<Transaction>

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
        const swapFunction: SwapFunction = async (
          poolId: BytesLike | string,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          deltaInMax: BigNumberish,
          fromMargin: boolean
        ): Promise<Transaction> => {
          await loadedContracts.risky.approve(loadedContracts.engineSwap.address, constants.MaxUint256)
          await loadedContracts.stable.approve(loadedContracts.engineSwap.address, constants.MaxUint256)
          return loadedContracts.engineSwap.swap(poolId, addXRemoveY, deltaOut, deltaInMax, fromMargin, empty)
        }

        loadedFunctions.swapXForY = (
          poolId: BytesLike,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          deltaInMax: BigNumberish,
          fromMargin: boolean
        ) => {
          return swapFunction(poolId, true, deltaOut, deltaInMax, fromMargin)
        }
        loadedFunctions.swapYForX = (
          poolId: BytesLike,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          deltaInMax: BigNumberish,
          fromMargin: boolean
        ) => {
          return swapFunction(poolId, false, deltaOut, deltaInMax, fromMargin)
        }
        break
      case 'engineCreate':
        break
      case 'engineWithdraw':
        break
      case 'engineDeposit':
        loadedFunctions.depositFunction = async (
          delRisky: BigNumberish,
          delStable: BigNumberish,
          from?: Wallet
        ): Promise<Transaction> => {
          if (from) {
            loadedContracts.risky.connect(from)
            loadedContracts.stable.connect(from)
            loadedContracts.engineDeposit.connect(from)
          }
          await loadedContracts.risky.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
          await loadedContracts.stable.approve(loadedContracts.engineDeposit.address, constants.MaxUint256)
          return loadedContracts.engineDeposit.deposit(from ? from.address : deployer.address, delRisky, delStable, empty)
        }
        break
      default:
        break
    }
  }
  return loadedFunctions
}
