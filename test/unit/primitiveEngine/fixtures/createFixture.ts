import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'

import { TestCalleeCreate, TestCalleeCreate__factory } from '../../../../typechain'

export type PrimitiveEngineCreateFixture = PrimitiveEngineFixture & { create: TestCalleeCreate }

export async function primitiveEngineCreateFixture(signers: Wallet[]): Promise<PrimitiveEngineCreateFixture> {
  const [deployer] = signers
  const engineFixture = await loadFixture(primitiveEngineFixture)

  const create = await new TestCalleeCreate__factory(deployer).deploy(
    engineFixture.primitiveEngine.address,
    engineFixture.risky.address,
    engineFixture.stable.address
  )

  await engineFixture.stable.approve(create.address, constants.MaxUint256)
  await engineFixture.risky.approve(create.address, constants.MaxUint256)

  return {
    create,
    ...engineFixture,
  }
}
