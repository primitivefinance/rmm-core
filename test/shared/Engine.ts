import { parseWei, fromInt, fromMantissa } from './Units'
import { constants, Transaction, BytesLike, BigNumberish, BigNumber, Wallet } from 'ethers'
import { getTradingFunction } from './ReplicationMath'
import { IERC20, TestCallee, PrimitiveEngine, TestBlackScholes, TestEngineSwap, Token, Create } from '../../typechain'
import {
  Calibration,
  Reserve,
  PoolParams,
  getReserve,
  getPoolParams,
  allocate,
  getMargin,
  getDeltaIn,
  remove,
  getPosition,
  calcRY2WithXOut,
} from './utilities'
import { MockContract } from '@ethereum-waffle/mock-contract'

// @TODO: Fix where these are, I cheated this
export {
  Calibration,
  Reserve,
  PoolParams,
  getReserve,
  getPoolParams,
  allocate,
  getMargin,
  getDeltaIn,
  remove,
  getPosition,
  calcRY2WithXOut,
}

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}

export const EngineEvents = {
  DEPOSITED: 'Deposited',
  WITHDRAWN: 'Withdrawn',
  CREATE: 'Create',
  UPDATE: 'Update',
  ADDED_BOTH: 'AddedBoth',
  REMOVED_BOTH: 'RemovedBoth',
  SWAP: 'Swap',
  LOANED: 'Loaned',
  CLAIMED: 'Claimed',
  BORROWED: 'Borrowed',
  REPAID: 'Repaid',
}

export type DepositFunction = (deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type WithdrawFunction = (deltaX: BigNumberish, deltaY: BigNumberish) => Promise<Transaction>
export type AddLiquidityFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>
export type SwapFunction = (pid: BytesLike, deltaOut: BigNumberish, deltaInMax: BigNumberish) => Promise<Transaction>
export type CreateFunction = (strike: BigNumber, sigma: number, time: number, spot: BigNumberish) => Promise<Transaction>
export type LendFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>
export type ClaimFunction = (pid: BytesLike, nonce: BigNumberish, deltaL: BigNumberish) => Promise<Transaction>
export type BorrowFunction = (pid: BytesLike, recipient: string, deltaL: BigNumberish) => Promise<Transaction>
export type RepayFunction = (
  pid: BytesLike,
  owner: string,
  nonce: BigNumberish,
  deltaL: BigNumberish
) => Promise<Transaction>

export interface EngineFunctions {
  deposit: DepositFunction
  withdraw: WithdrawFunction
  addLiquidity: AddLiquidityFunction
  swapXForY: SwapFunction
  swapYForX: SwapFunction
  create: CreateFunction
  lend: LendFunction
  claim: ClaimFunction
  borrow: BorrowFunction
  repay: RepayFunction
}

// ===== Engine Functions ====
export function createEngineFunctions({
  target,
  TX1,
  TY2,
  engine,
  signer,
  bs,
}: {
  target: TestCallee | TestEngineSwap | Create
  TX1: Token
  TY2: Token
  engine: PrimitiveEngine
  signer: Wallet
  bs: TestBlackScholes
}): EngineFunctions {
  const deposit: DepositFunction = async (deltaX: BigNumberish, deltaY: BigNumberish): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.deposit(target.address, deltaX, deltaY)
  }

  const withdraw: WithdrawFunction = async (deltaX: BigNumberish, deltaY: BigNumberish): Promise<Transaction> => {
    return engine.withdraw(deltaX, deltaY)
  }

  const addLiquidity: AddLiquidityFunction = async (
    pid: BytesLike,
    nonce: BigNumberish,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)
    return target.allocateFromMargin(pid, target.address, deltaL)
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

  const create: CreateFunction = async (
    strike: BigNumber,
    sigma: number,
    time: number,
    spot: BigNumberish
  ): Promise<Transaction> => {
    // get delta of pool's calibration
    const calibration: Calibration = { strike, sigma, time }
    const delta = await bs.callDelta(calibration, spot)
    // set risky reserve to 1 - delta
    const RX1 = parseWei(1 - fromMantissa(fromInt(delta.toString())))
    // set riskless reserve using trading function
    const RY2 = parseWei(getTradingFunction(RX1, parseWei('1'), calibration))

    await TX1.mint(signer.address, parseWei('10000').raw)
    await TY2.mint(signer.address, parseWei('10000').raw)
    await TX1.approve(target.address, constants.MaxUint256)
    await TY2.approve(target.address, constants.MaxUint256)

    // Note: Found the bug. We added a callback to create function, so testCallee must call.
    return target.create(engine.address, strike, sigma, time, spot)
  }

  const lend: LendFunction = async (pid: BytesLike, deltaL: BigNumberish): Promise<Transaction> => {
    return engine.lend(pid, deltaL)
  }

  const claim: ClaimFunction = async (pid: BytesLike, deltaL: BigNumberish): Promise<Transaction> => {
    return engine.claim(pid, deltaL)
  }
  const borrow: BorrowFunction = async (pid: BytesLike, recipient: string, deltaL: BigNumberish): Promise<Transaction> => {
    return target.borrow(pid, recipient, deltaL)
  }
  const repay: RepayFunction = async (
    pid: BytesLike,
    owner: string,
    nonce: BigNumberish,
    deltaL: BigNumberish
  ): Promise<Transaction> => {
    return target.repay(pid, owner, nonce, deltaL)
  }

  return {
    deposit,
    withdraw,
    addLiquidity,
    swapXForY,
    swapYForX,
    create,
    lend,
    claim,
    borrow,
    repay,
  }
}
