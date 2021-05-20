import { constants, Wallet, Transaction, BytesLike, BigNumberish } from 'ethers'
import { IERC20, PrimitiveHouse, PrimitiveEngine } from '../../typechain'

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}
export type DepositFunction = (owner: string, deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type WithdrawFunction = (deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type AddBothFromMarginFunction = (
  pid: BytesLike,
  owner: BytesLike,
  nonce: BigNumberish,
  deltaL: BigNumberish
) => Promise<Transaction>
export type AddBothFromExternalFunction = (
  pid: BytesLike,
  owner: BytesLike,
  nonce: BigNumberish,
  deltaL: BigNumberish
) => Promise<Transaction>
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
export type LendFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>
export type ClaimFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>

export interface HouseFunctions {
  deposit: DepositFunction
  withdraw: WithdrawFunction
  addBothFromMargin: AddBothFromMarginFunction
  addBothFromExternal: AddBothFromExternalFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
  lend: LendFunction
}

// ===== Engine Functions ====
export function createHouseFunctions({
  target,
  TX1,
  TY2,
  engine,
}: {
  target: PrimitiveHouse
  TX1: IERC20
  TY2: IERC20
  engine: PrimitiveEngine
}): HouseFunctions {
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
    return engine.withdraw(deltaX, deltaY)
  }

  const addBothFromMargin: AddBothFromMarginFunction = async (
    pid: BytesLike,
    nonce: BigNumberish,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.addBothFromMargin(pid, target.address, nonce, deltaL)
  }

  const addBothFromExternal: AddBothFromExternalFunction = async (
    pid: BytesLike,
    nonce: BigNumberish,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.addBothFromExternal(pid, target.address, nonce, deltaL)
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

  const lend: LendFunction = async (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish): Promise<Transaction> => {
    return engine.lend(pid, nonce, deltaL)
  }

  return {
    deposit,
    withdraw,
    addBothFromMargin,
    addBothFromExternal,
    swapXForY,
    swapYForX,
    lend,
  }
}
