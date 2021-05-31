import { parseWei, fromInt, fromMantissa } from './Units'
import { constants, Transaction, BytesLike, BigNumberish } from 'ethers'
import { getTradingFunction } from './ReplicationMath'
import { IERC20, TestCallee, PrimitiveEngine, TestBlackScholes } from '../../typechain'
import { Calibration } from './utilities'

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
export type CreateFunction = (calibration: Calibration, spot: BigNumberish) => Promise<Transaction>
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
  bs,
}: {
  target: TestCallee
  TX1: IERC20
  TY2: IERC20
  engine: PrimitiveEngine
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
    return target.addBothFromMargin(pid, target.address, nonce, deltaL)
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

  const create: CreateFunction = async (calibration: Calibration, spot: BigNumberish): Promise<Transaction> => {
    // get delta of pool's calibration
    const delta = await bs.callDelta(calibration, spot)
    // set risky reserve to 1 - delta
    const RX1 = parseWei(1 - fromMantissa(fromInt(delta.toString())))
    // set riskless reserve using trading function
    const RY2 = parseWei(getTradingFunction(RX1, parseWei('1'), calibration))
    // mint the tokens to the engine before we call create()
    await TX1.mint(engine.address, RX1.raw)
    await TY2.mint(engine.address, RY2.raw)
    const { strike, sigma, time } = calibration
    return engine.create(strike, sigma, time, spot)
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
