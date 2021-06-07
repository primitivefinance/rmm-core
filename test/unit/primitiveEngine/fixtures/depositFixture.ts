import { PrimitiveEngineCreateFixture, primitiveEngineCreateFixture } from './createFixture'
import { Wallet } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineDeposit, EngineDeposit__factory } from '../../../../typechain'

export type PrimitiveEngineDepositFixture = PrimitiveEngineCreateFixture & { deposit: EngineDeposit }

export async function primitiveEngineDepositFixture(signers: Wallet[]): Promise<PrimitiveEngineDepositFixture> {
  const [deployer] = signers
  const createFixture = await loadFixture(primitiveEngineCreateFixture)

  const deposit = await new EngineDeposit__factory(deployer).deploy(
    createFixture.primitiveEngine.address,
    createFixture.risky.address,
    createFixture.stable.address
  )

  return {
    deposit,
    ...createFixture,
  }
}
