import { ethers } from 'hardhat'
import { PrimitiveEngineDepositFixture, primitiveEngineDepositFixture } from './depositFixture'
import { constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineAllocate } from '../../../../typechain'
import { parseWei, PERCENTAGE } from '../../../shared/Units'
import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from './createFixture'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

export type PrimitiveEngineAllocateFixture = PrimitiveEngineDepositFixture &
  PrimitiveEngineCreateFixture & { allocate: EngineAllocate; pid: string }

export async function primitiveEngineAllocateFixture(): Promise<PrimitiveEngineAllocateFixture> {
  const createFixture = await loadFixture(primitiveEngineCreateFixture)
  console.log(await createFixture.create.engine())
  const depositFixture = await loadFixture(primitiveEngineDepositFixture)
  console.log(await depositFixture.deposit.engine())

  const context = {
    ...createFixture,
    ...depositFixture,
  }

  console.log(context)

  const allocate = ((await (await ethers.getContractFactory('EngineAllocate')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineAllocate

  await context.stable.approve(allocate.address, constants.MaxUint256)
  await context.risky.approve(allocate.address, constants.MaxUint256)

  await context.deposit.deposit(allocate.address, parseWei('1000').raw, parseWei('1000').raw)

  const pid = await context.primitiveEngine.getPoolId(strike, sigma, time)

  return {
    allocate,
    pid,
    ...context,
  }
}
