import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineCreate, EngineCreate__factory } from '../../../../typechain'

export type PrimitiveEngineCreateFixture = PrimitiveEngineFixture & { create: EngineCreate }

export async function primitiveEngineCreateFixture(signers: Wallet[]): Promise<PrimitiveEngineCreateFixture> {
  const [deployer] = signers
  const engineFixture = await loadFixture(primitiveEngineFixture)

  const create = await new EngineCreate__factory(deployer).deploy(
    engineFixture.primitiveEngine.address,
    engineFixture.risky.address,
    engineFixture.stable.address
  )

  await engineFixture.stable.mint(deployer.address, constants.MaxUint256)
  await engineFixture.risky.mint(deployer.address, constants.MaxUint256)

  await engineFixture.stable.approve(create.address, constants.MaxUint256)
  await engineFixture.risky.approve(create.address, constants.MaxUint256)

  return {
    create,
    ...engineFixture,
  }
}
