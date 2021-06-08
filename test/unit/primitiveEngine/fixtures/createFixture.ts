import { ethers } from 'hardhat'
import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineCreate } from '../../../../typechain'

export type PrimitiveEngineCreateFixture = PrimitiveEngineFixture & { create: EngineCreate }

export async function primitiveEngineCreateFixture(signers: Wallet[]): Promise<PrimitiveEngineCreateFixture> {
  const [deployer] = signers
  const context = await loadFixture(primitiveEngineFixture)

  const create = ((await (await ethers.getContractFactory('EngineCreate')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineCreate

  await context.stable.mint(deployer.address, constants.MaxUint256)
  await context.risky.mint(deployer.address, constants.MaxUint256)

  await context.stable.approve(create.address, constants.MaxUint256)
  await context.risky.approve(create.address, constants.MaxUint256)

  return {
    create,
    ...context,
  }
}
