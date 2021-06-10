import { ethers } from 'hardhat'
import { BigNumber, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineAllocate, EngineDeposit } from '../../../../typechain'
import { Wallet } from 'ethers'
import { parseWei, PERCENTAGE } from '../../../shared/Units'
import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from './createFixture'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

export type PrimitiveEngineAllocateFixture = PrimitiveEngineCreateFixture & {
  deposit: EngineDeposit
  allocate: EngineAllocate
  pid: string
  strike: BigNumber
  sigma: number
  time: number
}

export async function primitiveEngineAllocateFixture(signers: Wallet[]): Promise<PrimitiveEngineAllocateFixture> {
  const [deployer] = signers
  const context = await loadFixture(primitiveEngineCreateFixture)

  const deposit = ((await (await ethers.getContractFactory('EngineDeposit')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineDeposit

  const allocate = ((await (await ethers.getContractFactory('EngineAllocate')).deploy(
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address
  )) as unknown) as EngineAllocate

  await context.stable.mint(deployer.address, constants.MaxUint256)
  await context.risky.mint(deployer.address, constants.MaxUint256)

  await context.stable.approve(allocate.address, constants.MaxUint256)
  await context.risky.approve(allocate.address, constants.MaxUint256)

  await context.stable.approve(deposit.address, constants.MaxUint256)
  await context.risky.approve(deposit.address, constants.MaxUint256)

  await deposit.deposit(allocate.address, parseWei('1000').raw, parseWei('1000').raw)

  const pid = await context.primitiveEngine.getPoolId(strike, sigma, time)

  return {
    deposit,
    allocate,
    pid,
    strike,
    sigma,
    time,
    ...context,
  }
}
