import { constants, Wallet, Transaction, BigNumberish, BytesLike } from 'ethers'
import { IERC20, PrimitiveHouse, PrimitiveEngine } from '../../typechain'
import { parseWei, Wei, BigNumber } from './Units'

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}
export type DepositFunction = (owner: string, deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type WithdrawFunction = (deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type AllocateFromMarginFunction = (pid: string, owner: string, deltaL: BigNumberish) => Promise<Transaction>
export type AllocateFromExternalFunction = (pid: string, owner: string, deltaL: BigNumberish) => Promise<Transaction>
export type RepayFromMarginFunction = (
  pid: BytesLike,
  owner: BytesLike,
  nonce: BigNumberish,
  deltaL: BigNumberish
) => Promise<Transaction>
export type RepayFromExternalFunction = (
  pid: BytesLike,
  owner: BytesLike,
  nonce: BigNumberish,
  deltaL: BigNumberish
) => Promise<Transaction>
export type SwapFunction = (pid: BytesLike, deltaOut: BigNumberish, deltaInMax: BigNumberish) => Promise<Transaction>
export type LendFunction = (owner: string, pid: BytesLike, deltaL: BigNumberish) => Promise<Transaction>
export type ClaimFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>
export type CreateFunction = (
  strike: BigNumberish,
  sigma: BigNumberish,
  time: BigNumberish,
  riskyPrice: BigNumberish
) => Promise<Transaction>

export interface HouseFunctions {
  create: CreateFunction
  deposit: DepositFunction
  withdraw: WithdrawFunction
  allocateFromMargin: AllocateFromMarginFunction
  allocateFromExternal: AllocateFromExternalFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
  lend: LendFunction
}

// ===== Engine Functions ====
export function createHouseFunctions({
  target,
  TX1,
  TY2,
}: {
  target: PrimitiveHouse
  TX1: IERC20
  TY2: IERC20
  engine: PrimitiveEngine
}): HouseFunctions {
  const create: CreateFunction = async (
    strike: BigNumberish,
    sigma: BigNumberish,
    time: BigNumberish,
    riskyPrice: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.create(strike, sigma, time, riskyPrice)
  }

  const deposit: DepositFunction = async (
    owner: string,
    deltaX: BigNumberish,
    deltaY: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.deposit(owner, deltaX, deltaY)
  }

  const withdraw: WithdrawFunction = async (deltaX: BigNumberish, deltaY: BigNumberish): Promise<Transaction> => {
    return target.withdraw(deltaX, deltaY)
  }

  const allocateFromMargin: AllocateFromMarginFunction = async (
    pid: string,
    owner: string,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.allocateFromMargin(pid, owner, deltaL)
  }

  const allocateFromExternal: AllocateFromExternalFunction = async (
    pid: string,
    owner: string,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.allocateFromExternal(pid, owner, deltaL)
  }

  const swap = async (
    pid: BytesLike | string,
    addXRemoveY: boolean,
    deltaOut: BigNumberish,
    deltaInMax: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.swap(pid, addXRemoveY, deltaOut, deltaInMax)
  }

  const swapXForY: SwapFunction = (pid: BytesLike, deltaOut: BigNumberish, deltaInMax: BigNumberish) => {
    return swap(pid, true, deltaOut, deltaInMax)
  }
  const swapYForX: SwapFunction = (pid: BytesLike, deltaOut: BigNumberish, deltaInMax: BigNumberish) => {
    return swap(pid, false, deltaOut, deltaInMax)
  }

  const lend: LendFunction = async (owner: string, pid: BytesLike, deltaL: BigNumberish): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    await target.allocateFromExternal(pid, owner, BigNumber.from(deltaL).mul(10))
    return target.lend(pid, deltaL)
  }

  return {
    create,
    deposit,
    withdraw,
    allocateFromMargin,
    allocateFromExternal,
    swapXForY,
    swapYForX,
    lend,
  }
}
