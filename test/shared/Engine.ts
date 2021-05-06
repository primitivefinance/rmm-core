import { Wei, toBN, formatEther, parseEther, parseWei, fromInt, BigNumber } from './Units'
import { Contract } from 'ethers'
import { getTradingFunction, getInverseTradingFunction } from './ReplicationMath'

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}

export const EngineEvents = {
  DEPOSITED: 'Deposited',
  WITHDRAWN: 'Withdrawn',
  POSITION_UPDATED: 'PositionUpdated',
  MARGIN_UPDATED: 'MarginUpdated',
  CREATE: 'Create',
  UPDATE: 'Update',
  ADDED_BOTH: 'AddedBoth',
  REMOVED_BOTH: 'RemovedBoth',
  ADDED_X: 'AddedX',
  REMOVED_X: 'RemovedX',
  SWAP: 'Swap',
}

export interface Reserve {
  RX1: Wei
  RY2: Wei
  liquidity: Wei
  float: Wei
}

export async function getReserve(engine: Contract, poolId: string, log?: boolean): Promise<Reserve> {
  const res = await engine.getReserve(poolId)
  const reserve: Reserve = {
    RX1: new Wei(res.RX1),
    RY2: new Wei(res.RY2),
    liquidity: new Wei(res.liquidity),
    float: new Wei(res.float),
  }
  if (log)
    console.log(`
      RX1: ${formatEther(res.RX1)},
      RY2: ${formatEther(res.RY2)},
      liquidity: ${formatEther(res.liquidity)},
      float: ${formatEther(res.float)}
    `)
  return reserve
}

export interface Position {
  owner: string
  nonce: number
  BX1: Wei
  BY2: Wei
  liquidity: Wei
  float: Wei
  loan: Wei
  unlocked: boolean
}

export async function getPosition(engine: Contract, owner: string, nonce: number, log?: boolean): Promise<Position> {
  const pos = await engine.getPosition(owner, nonce)
  const position: Position = {
    owner: pos.owner,
    nonce: pos.nonce,
    BX1: new Wei(pos.BX1),
    BY2: new Wei(pos.BY2),
    liquidity: new Wei(pos.liquidity),
    float: new Wei(pos.float),
    loan: new Wei(pos.loan),
    unlocked: pos.unlocked,
  }
  if (log)
    console.log(`
      owner: ${pos.owner},
      nonce: ${pos.nonce},
      BX1: ${formatEther(pos.BX1)},
      BY2: ${formatEther(pos.BY2)},
      liquidity: ${formatEther(pos.liquidity)},
      float: ${formatEther(pos.float)},
      loan: ${formatEther(pos.loan)}
      unlocked: ${pos.unlocked}
    `)
  return position
}

export interface Margin {
  owner: string
  BX1: Wei
  BY2: Wei
  unlocked: boolean
}

export async function getMargin(engine: Contract, owner: string, log?: boolean): Promise<Margin> {
  const mar = await engine.getMargin(owner)
  const margin: Margin = {
    owner: mar.owner,
    BX1: new Wei(mar.BX1),
    BY2: new Wei(mar.BY2),
    unlocked: mar.unlocked,
  }
  if (log)
    console.log(`
      owner: ${mar.owner},
      BX1: ${formatEther(mar.BX1)},
      BY2: ${formatEther(mar.BY2)},
      unlocked: ${mar.unlocked}
    `)
  return margin
}

export interface Calibration {
  strike: BigNumber
  sigma: number
  time: number
}

export async function getCalibration(engine: Contract, poolId: string, log?: boolean): Promise<Calibration> {
  const cal = await engine.getCalibration(poolId)
  const calibration: Calibration = {
    strike: toBN(cal.strike),
    sigma: +cal.sigma,
    time: +cal.time,
  }
  if (log)
    console.log(`
        Strike: ${formatEther(cal.strike)},
        Sigma:  ${cal.sigma},
        Time:   ${cal.time}
      `)
  return calibration
}

export interface PoolParams {
  reserve: Reserve
  calibration: Calibration
}

export async function getPoolParams(engine: Contract, poolId: string, log?: boolean): Promise<PoolParams> {
  const reserve: Reserve = await getReserve(engine, poolId, log)
  const calibration: Calibration = await getCalibration(engine, poolId, log)
  return { reserve, calibration }
}

export function calculateInvariant(params: PoolParams): number {
  const input: number = getTradingFunction(params.reserve.RX1, params.reserve.liquidity, params.calibration)
  const invariant: Wei = params.reserve.RY2.sub(parseEther(input > 0.0001 ? input.toString() : '0'))
  return invariant.float
}

export function getOutputAmount(params: PoolParams, deltaX: Wei): Wei {
  const RX1: Wei = params.reserve.RX1.add(deltaX)
  const RY2: Wei = params.reserve.RY2
  const liquidity: Wei = params.reserve.liquidity
  const TF: number = getTradingFunction(RX1, liquidity, params.calibration)
  const PostRY2: Wei = parseWei(TF.toString())
  const deltaY = PostRY2.gt(RY2.raw) ? PostRY2.sub(RY2.raw) : RY2.sub(PostRY2)
  return deltaY
}

export interface SwapXOutput {
  deltaY: Wei
  feePaid: Wei
  postParams: PoolParams
  postInvariant: number
}

export interface SwapAddXRemoveY {
  deltaIn: Wei
  postParams: PoolParams
  postInvariant: number
}

/**
 * @notice Returns the amount of Y removed by adding X.
 * @param deltaX The amount of X to add or remove, can be negative.
 * @param invariantInt128 The previous invariant value.
 * @param fee The amount of Y kept as a fee.
 * @param params Parameters of the engine, including strike,time,sigma,RX1,RY2
 * @returns Next R1 amount
 * @returns Next R2 amount
 * @returns Amount of Y output
 */
export function getDeltaY(deltaX: Wei, invariantInt128: string, fee: Wei, params: PoolParams): SwapXOutput {
  const RX1: Wei = params.reserve.RX1
  const RY2: Wei = params.reserve.RY2
  const liquidity: Wei = params.reserve.liquidity
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let FXR1 = RX1.add(deltaX)
  const FX = parseWei(getTradingFunction(FXR1, liquidity, params.calibration).toString())
  let FYR2 = invariant.add(FX)
  let deltaY = FYR2.gt(RY2) ? FYR2.sub(RY2) : RY2.sub(FYR2)
  let feePaid = parseWei('0') //deltaY.div(fee)
  const yToX = deltaX.raw.isNegative()
  deltaY = yToX ? deltaY.add(feePaid) : deltaY.sub(feePaid)
  FYR2 = yToX ? RY2.add(deltaY) : RY2.sub(deltaY)
  const postParams: PoolParams = {
    reserve: {
      RX1: FXR1,
      RY2: FYR2,
      liquidity: params.reserve.liquidity,
      float: params.reserve.float,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(postParams)
  return { deltaY, feePaid, postParams, postInvariant }
}

export function getDeltaIn(
  deltaOut: Wei,
  addXRemoveY: boolean,
  invariantInt128: string,
  params: PoolParams
): SwapAddXRemoveY {
  let deltaIn: Wei
  const RX1: Wei = params.reserve.RX1
  const RY2: Wei = params.reserve.RY2
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let nextRY2: Wei, postRX1: Wei, nextRX1: Wei, postRY2: Wei
  if (addXRemoveY) {
    nextRX1 = parseWei(_removeY(deltaOut, params).toString())
    postRX1 = nextRX1.sub(invariant)
    deltaIn = postRX1.gt(RX1) ? postRX1.sub(RX1) : RX1.sub(postRX1)
  } else {
    nextRY2 = parseWei(_removeX(deltaOut, params).toString())
    postRY2 = invariant.add(nextRY2)
    deltaIn = postRY2.gt(RY2) ? postRY2.sub(RY2) : RY2.sub(postRY2)
  }

  postRX1 = addXRemoveY ? RX1.add(deltaIn) : RX1.sub(deltaOut)
  postRY2 = addXRemoveY ? RY2.sub(deltaOut) : RY2.add(deltaIn)
  console.log(postRY2.parsed, postRX1.parsed, deltaIn.parsed, deltaOut.parsed, invariant.parsed)

  const postParams: PoolParams = {
    reserve: {
      RX1: postRX1,
      RY2: postRY2,
      liquidity: params.reserve.liquidity,
      float: params.reserve.float,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(postParams)
  return { deltaIn, postParams, postInvariant }
}

// new functions in contracts
export function _removeY(deltaY: Wei, params: PoolParams) {
  const RY2: Wei = params.reserve.RY2
  const nextRY2 = RY2.sub(deltaY)
  return _calcRX1(nextRY2, params)
}

export function _calcRX1(RY2: Wei, params: PoolParams) {
  return getInverseTradingFunction(RY2, params.reserve.liquidity, params.calibration)
}

export function _removeX(deltaX: Wei, params: PoolParams) {
  const RX1 = params.reserve.RX1
  const nextRX1 = RX1.sub(deltaX)
  return _calcRY2(nextRX1, params)
}

export function _calcRY2(RX1: Wei, params: PoolParams) {
  return getTradingFunction(RX1, params.reserve.liquidity, params.calibration)
}

export function addBoth(deltaL: Wei, params: PoolParams): [Wei, Wei, PoolParams, number] {
  const { RX1, RY2, liquidity, float } = params.reserve
  const deltaX = deltaL.mul(RX1).div(liquidity)
  const deltaY = deltaL.mul(RY2).div(liquidity)
  const postRX1 = deltaX.add(RX1)
  const postRY2 = deltaY.add(RY2)
  const postLiquidity = deltaL.add(liquidity)
  const post: PoolParams = {
    reserve: {
      RX1: postRX1,
      RY2: postRY2,
      liquidity: postLiquidity,
      float: float,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(post)
  return [deltaX, deltaY, post, postInvariant]
}
