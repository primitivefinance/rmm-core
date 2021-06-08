import { ethers } from 'hardhat'
import { PrimitiveEngineDepositFixture, primitiveEngineDepositFixture } from './depositFixture'
import { Wallet } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineWithdraw } from '../../../../typechain'
import { parseWei } from '../../../shared/Units'

export type PrimitiveEngineWithdrawFixture = PrimitiveEngineDepositFixture & { withdraw: EngineWithdraw }

export async function primitiveEngineWithdrawFixture(signers: Wallet[]): Promise<PrimitiveEngineWithdrawFixture> {
  const context = await loadFixture(primitiveEngineDepositFixture)

  const withdraw = ((await (await ethers.getContractFactory('EngineWithdraw')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineWithdraw

  await context.deposit.deposit(withdraw.address, parseWei('1000').raw, parseWei('1000').raw)

  return {
    withdraw,
    ...context,
  }
}
