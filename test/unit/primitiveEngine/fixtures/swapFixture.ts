import hre from 'hardhat'
import { primitiveEngineDepositFixture, PrimitiveEngineDepositFixture } from '../fixtures/depositFixture'
import { Wallet, constants, BytesLike, BigNumberish, Transaction } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import { EngineSwap } from '../../../../typechain'

interface Contracts {
  swap: EngineSwap
}

interface Functions {
  swapXForY: SwapFunction
  swapYForX: SwapFunction
}

export type PrimitiveEngineSwapFixture = PrimitiveEngineDepositFixture & {
  contracts: Contracts
  functions: Functions
}
export type SwapFunction = (
  pid: BytesLike,
  deltaOut: BigNumberish,
  deltaInMax: BigNumberish,
  fromMargin: boolean
) => Promise<Transaction>

export async function primitiveEngineSwapFixture(this, signers: Wallet[]): Promise<PrimitiveEngineSwapFixture> {
  const [deployer] = signers
  const context = await primitiveEngineDepositFixture(signers)
  const swapArtifact = await hre.artifacts.readArtifact('EngineSwap')
  const swap = (await deployContract(signers[0], swapArtifact, [
    context.contracts.primitiveEngine.address,
    context.contracts.risky.address,
    context.contracts.stable.address,
  ])) as EngineSwap

  await context.contracts.stable.mint(deployer.address, constants.MaxUint256.div(4))
  await context.contracts.risky.mint(deployer.address, constants.MaxUint256.div(4))
  await context.contracts.stable.approve(swap.address, constants.MaxUint256)
  await context.contracts.risky.approve(swap.address, constants.MaxUint256)

  const swapFunction = async (
    pid: BytesLike | string,
    addXRemoveY: boolean,
    deltaOut: BigNumberish,
    deltaInMax: BigNumberish,
    fromMargin: boolean
  ): Promise<Transaction> => {
    await context.contracts.risky.approve(swap.address, constants.MaxUint256)
    await context.contracts.stable.approve(swap.address, constants.MaxUint256)
    return swap.swap(pid, addXRemoveY, deltaOut, deltaInMax, fromMargin)
  }

  const swapXForY: SwapFunction = (
    pid: BytesLike,
    deltaOut: BigNumberish,
    deltaInMax: BigNumberish,
    fromMargin: boolean
  ) => {
    return swapFunction(pid, true, deltaOut, deltaInMax, fromMargin)
  }
  const swapYForX: SwapFunction = (
    pid: BytesLike,
    deltaOut: BigNumberish,
    deltaInMax: BigNumberish,
    fromMargin: boolean
  ) => {
    return swapFunction(pid, false, deltaOut, deltaInMax, fromMargin)
  }

  console.log('loaded swap fixture')
  return {
    ...context,
    contracts: {
      ...context.contracts,
      swap: swap,
    },
    functions: {
      ...context.functions,
      swapXForY: swapXForY,
      swapYForX: swapYForX,
    },
  }
}
