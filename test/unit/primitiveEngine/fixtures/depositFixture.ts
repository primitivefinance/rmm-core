import { ethers } from 'hardhat'
import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from './createFixture'
import { Wallet, constants, Transaction } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { EngineDeposit } from '../../../../typechain'
import { BigNumberish } from '../../../shared/Units'

interface Contracts {
  deposit: EngineDeposit
}

interface Functions {
  depositFunction: DepositFunction
}

export type PrimitiveEngineDepositFixture = PrimitiveEngineCreateFixture & {
  contracts: Contracts
  functions: Functions
}
export type DepositFunction = (deltaX: BigNumberish, deltaY: BigNumberish, from?: Wallet) => Promise<Transaction>

export async function primitiveEngineDepositFixture(signers: Wallet[]): Promise<PrimitiveEngineDepositFixture> {
  const [deployer] = signers
  const context = await primitiveEngineCreateFixture(signers)

  const deposit = ((await (await ethers.getContractFactory('EngineDeposit')).deploy(
    context.contracts.primitiveEngine.address,
    context.contracts.risky.address,
    context.contracts.stable.address
  )) as unknown) as EngineDeposit

  await context.contracts.stable.mint(deployer.address, constants.MaxUint256.div(4))
  await context.contracts.risky.mint(deployer.address, constants.MaxUint256.div(4))
  await context.contracts.stable.approve(deposit.address, constants.MaxUint256)
  await context.contracts.risky.approve(deposit.address, constants.MaxUint256)

  const depositFunction: DepositFunction = async (
    deltaX: BigNumberish,
    deltaY: BigNumberish,
    from?: Wallet
  ): Promise<Transaction> => {
    if (from) {
      context.contracts.risky.connect(from)
      context.contracts.stable.connect(from)
      deposit.connect(from)
    }
    await context.contracts.risky.approve(deposit.address, constants.MaxUint256)
    await context.contracts.stable.approve(deposit.address, constants.MaxUint256)
    return deposit.deposit(deposit.address, deltaX, deltaY)
  }

  return {
    ...context,
    contracts: {
      ...context.contracts,
      deposit: deposit,
    },
    functions: {
      ...context.functions,
      depositFunction: depositFunction,
    },
  }
}
