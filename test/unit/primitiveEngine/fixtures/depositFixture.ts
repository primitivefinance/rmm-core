import { PrimitiveEngineFixture, primitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineDeposit, EngineDeposit__factory } from '../../../../typechain'

export type PrimitiveEngineDepositFixture = PrimitiveEngineFixture & { deposit: EngineDeposit }

export async function primitiveEngineDepositFixture(signers: Wallet[]): Promise<PrimitiveEngineDepositFixture> {
  const [deployer] = signers
  const engineFixture = await loadFixture(primitiveEngineFixture)

  const deposit = await new EngineDeposit__factory(deployer).deploy(
    engineFixture.primitiveEngine.address,
    engineFixture.risky.address,
    engineFixture.stable.address
  )

  await engineFixture.stable.mint(deployer.address, constants.MaxUint256.div(4))
  await engineFixture.risky.mint(deployer.address, constants.MaxUint256.div(4))

  await engineFixture.stable.approve(deposit.address, constants.MaxUint256)
  await engineFixture.risky.approve(deposit.address, constants.MaxUint256)

  return {
    deposit,
    ...engineFixture,
  }
}
