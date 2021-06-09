import hre, { ethers } from 'hardhat'
import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from '../fixtures/createFixture'
import { Wallet, constants, BytesLike, BigNumberish, Transaction } from 'ethers'
import { loadFixture, deployContract } from 'ethereum-waffle'
import { EngineSwap, EngineSwap__factory } from '../../../../typechain'

export type PrimitiveEngineSwapFixture = PrimitiveEngineCreateFixture & {
  swap: EngineSwap
  swapXForY: SwapFunction
  swapYForX: SwapFunction
}
export type SwapFunction = (
  pid: BytesLike,
  deltaOut: BigNumberish,
  deltaInMax: BigNumberish,
  fromMargin: boolean
) => Promise<Transaction>

export async function primitiveEngineSwapFixture(this, signers: Wallet[]): Promise<PrimitiveEngineSwapFixture> {
  const [deployer] = signers
  const context = await primitiveEngineCreateFixture(signers)
  const swapArtifact = await hre.artifacts.readArtifact('EngineSwap')
  const swap = (await deployContract(signers[0], swapArtifact, [
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address,
  ])) as EngineSwap

  await context.stable.mint(deployer.address, constants.MaxUint256.div(4))
  await context.risky.mint(deployer.address, constants.MaxUint256.div(4))

  await context.stable.approve(swap.address, constants.MaxUint256)
  await context.risky.approve(swap.address, constants.MaxUint256)

  const swapFunction = async (
    pid: BytesLike | string,
    addXRemoveY: boolean,
    deltaOut: BigNumberish,
    deltaInMax: BigNumberish,
    fromMargin: boolean
  ): Promise<Transaction> => {
    await context.risky.approve(swap.address, constants.MaxUint256)
    await context.stable.approve(swap.address, constants.MaxUint256)
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
    swap,
    swapXForY,
    swapYForX,
    ...context,
  }
}
