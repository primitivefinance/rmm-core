import { BigNumberish, constants, Wallet, ContractTransaction, BytesLike } from 'ethers'
import { Contracts, Functions, ContractName } from '../../types'

const empty: BytesLike = constants.HashZero
export type DepositFunction = (
  delRisky: BigNumberish,
  delStable: BigNumberish,
  from?: Wallet
) => Promise<ContractTransaction>
export type SwapFunction = (
  signer: Wallet,
  poolId: BytesLike | string,
  addXRemoveY: boolean,
  deltaOut: BigNumberish,
  fromMargin: boolean
) => Promise<ContractTransaction>

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
          signer: Wallet,
          poolId: BytesLike | string,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          fromMargin: boolean
        ): Promise<ContractTransaction> => {
          await loadedContracts.risky.connect(signer).approve(loadedContracts.engineSwap.address, constants.MaxUint256)
          await loadedContracts.stable.connect(signer).approve(loadedContracts.engineSwap.address, constants.MaxUint256)
          return loadedContracts.engineSwap.connect(signer).swap(poolId, addXRemoveY, deltaOut, fromMargin, empty)
        }

        loadedFunctions.swapXForY = (
          signer: Wallet,
          poolId: BytesLike,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          fromMargin: boolean
        ) => {
          return swapFunction(signer, poolId, true, deltaOut, fromMargin)
        }
        loadedFunctions.swapYForX = (
          signer: Wallet,
          poolId: BytesLike,
          addXRemoveY: boolean,
          deltaOut: BigNumberish,
          fromMargin: boolean
        ) => {
          return swapFunction(signer, poolId, false, deltaOut, fromMargin)
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
        ): Promise<ContractTransaction> => {
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
