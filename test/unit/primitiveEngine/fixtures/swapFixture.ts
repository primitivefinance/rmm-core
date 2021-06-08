import { ethers } from 'hardhat'
import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from '../fixtures/createFixture'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineSwap, EngineSwap__factory } from '../../../../typechain'

export type PrimitiveEngineSwapFixture = PrimitiveEngineCreateFixture & { swap: EngineSwap }

export async function primitiveEngineSwapFixture(signers: Wallet[]): Promise<PrimitiveEngineSwapFixture> {
  const [deployer] = signers
  const context = await primitiveEngineCreateFixture(signers)

  const swap = ((await (await ethers.getContractFactory('EngineSwap')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineSwap

  await context.stable.mint(deployer.address, constants.MaxUint256.div(4))
  await context.risky.mint(deployer.address, constants.MaxUint256.div(4))

  await context.stable.approve(swap.address, constants.MaxUint256)
  await context.risky.approve(swap.address, constants.MaxUint256)

  return {
    swap,
    ...context,
  }
}
