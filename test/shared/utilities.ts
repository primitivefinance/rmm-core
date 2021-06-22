import { Wei, toBN, formatEther, parseEther, parseWei, fromInt, BigNumber, BigNumberish } from './Units'
import { BytesLike, utils } from 'ethers'
import bn from 'bignumber.js'
import { Contract } from '@ethersproject/contracts'

import { getTradingFunction, getInverseTradingFunction } from './ReplicationMath'

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export function allocate(delLiquidity: Wei, params: PoolParams): [Wei, Wei, PoolParams, number] {
  const { reserveRisky, reserveStable, liquidity, float, debt } = params.reserve
  const delRisky = delLiquidity.mul(reserveRisky).div(liquidity)
  const delStable = delLiquidity.mul(reserveStable).div(liquidity)
  const postRX1 = delRisky.add(reserveRisky)
  const postRY2 = delStable.add(reserveStable)
  const postLiquidity = delLiquidity.add(liquidity)
  const post: PoolParams = {
    reserve: {
      reserveRisky: postRX1,
      reserveStable: postRY2,
      liquidity: postLiquidity,
      float: float,
      debt: debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(post)
  return [delRisky, delStable, post, postInvariant]
}

export function remove(delLiquidity: Wei, params: PoolParams): [Wei, Wei, PoolParams, number] {
  const { reserveRisky, reserveStable, liquidity, float, debt } = params.reserve
  const delRisky = delLiquidity.mul(reserveRisky).div(liquidity)
  const delStable = delLiquidity.mul(reserveStable).div(liquidity)
  const postRX1 = reserveRisky.sub(delRisky)
  const postRY2 = reserveStable.sub(delStable)
  const postLiquidity = liquidity.sub(delLiquidity)
  const post: PoolParams = {
    reserve: {
      reserveRisky: postRX1,
      reserveStable: postRY2,
      liquidity: postLiquidity,
      float: float,
      debt: debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(post)
  return [delRisky, delStable, post, postInvariant]
}

// ===== Swaps =====

export interface Swap {
  deltaIn: Wei
  deltaOut: Wei
  postParams: PoolParams
  postInvariant: number
}

const FEE = 30

/**
 * @notice  Calculates the required deltaIn if requesting deltaOut
 * @param deltaOut The amount of tokens requested out (swapped out of pool)
 * @param addXRemoveY The swap direction, if true, swap X to Y, else swap Y to X
 * @param invariantInt128 The previous invariant of the pool
 * @param params The pool's parameters, including calibration and reserve/liquidity
 * @returns deltaIn The required amount of tokens that must enter the pool to preserve invariant
 */
export function getDeltaIn(deltaOut: Wei, addXRemoveY: boolean, invariantInt128: string, params: PoolParams): Swap {
  let deltaIn: Wei
  const reserveRisky: Wei = params.reserve.reserveRisky
  const reserveStable: Wei = params.reserve.reserveStable
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let postRX1: Wei = new Wei('0')
  let postRY2: Wei = new Wei('0')

  if (addXRemoveY) {
    postRX1 = calcRX1WithYOut(deltaOut, params)
    postRY2 = reserveStable.sub(deltaOut)
    deltaIn = postRX1.gt(reserveRisky)
      ? postRX1
          .sub(reserveRisky)
          .mul(1e4)
          .div(1e4 - FEE)
      : reserveRisky.sub(postRX1)
  } else {
    postRY2 = calcRY2WithXOut(deltaOut, params)
    postRX1 = reserveRisky.sub(deltaOut)
    deltaIn = postRY2.gt(reserveStable)
      ? postRY2
          .sub(reserveStable)
          .mul(1e4)
          .div(1e4 - FEE)
      : reserveStable.sub(postRY2)
  }

  const postParams: PoolParams = {
    reserve: {
      reserveRisky: postRX1,
      reserveStable: postRY2,
      liquidity: params.reserve.liquidity,
      float: params.reserve.float,
      debt: params.reserve.debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(postParams)
  return { deltaIn, deltaOut, postParams, postInvariant }
}

export function getDeltaOut(deltaIn: Wei, addXRemoveY: boolean, invariantInt128: string, params: PoolParams): Swap {
  let deltaOut: Wei
  const reserveRisky: Wei = params.reserve.reserveRisky
  const reserveStable: Wei = params.reserve.reserveStable
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let postRX1: Wei = new Wei('0')
  let postRY2: Wei = new Wei('0')

  if (addXRemoveY) {
    postRX1 = reserveRisky.add(deltaIn)
    postRY2 = calcRY2WithXIn(postRX1, params)
    deltaOut = postRY2.gt(reserveStable) ? postRY2.sub(reserveStable) : reserveStable.sub(postRY2)
  } else {
    let nextRY2 = calcRY2WithXIn(deltaIn, params)
    postRY2 = invariant.add(nextRY2)
    postRX1 = reserveRisky.add(deltaIn)
    deltaOut = postRX1.gt(reserveRisky) ? postRX1.sub(reserveRisky) : reserveRisky.sub(postRX1)
  }

  const postParams: PoolParams = {
    reserve: {
      reserveRisky: postRX1,
      reserveStable: postRY2,
      liquidity: params.reserve.liquidity,
      float: params.reserve.float,
      debt: params.reserve.debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(postParams)
  return { deltaIn, deltaOut, postParams, postInvariant }
}

export function calcRX1WithYOut(delStable: Wei, params: PoolParams): Wei {
  const reserveStable: Wei = params.reserve.reserveStable
  const nextRY2 = reserveStable.sub(delStable)
  return parseWei(calcRX1WithRY2(nextRY2, params))
}

export function calcRY2WithXOut(delRisky: Wei, params: PoolParams): Wei {
  const reserveRisky = params.reserve.reserveRisky
  const nextRX1 = reserveRisky.sub(delRisky)
  return parseWei(calcRY2WithRX1(nextRX1, params))
}

export function calcRX1WithYIn(delStable: Wei, params: PoolParams): Wei {
  const reserveStable: Wei = params.reserve.reserveStable
  const nextRY2 = reserveStable.add(delStable)
  return parseWei(calcRX1WithRY2(nextRY2, params))
}

export function calcRY2WithXIn(delRisky: Wei, params: PoolParams): Wei {
  const reserveRisky = params.reserve.reserveRisky
  const nextRX1 = reserveRisky.add(delRisky)
  return parseWei(calcRY2WithRX1(nextRX1, params))
}

export function calcRX1WithRY2(reserveStable: Wei, params: PoolParams) {
  return getInverseTradingFunction(reserveStable, params.reserve.liquidity, params.calibration)
}

export function calcRY2WithRX1(reserveRisky: Wei, params: PoolParams) {
  return getTradingFunction(reserveRisky, params.reserve.liquidity, params.calibration)
}

export interface Reserve {
  reserveRisky: Wei
  reserveStable: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
}

export async function getReserve(engine: Contract, poolId: BytesLike, log?: boolean): Promise<Reserve> {
  const res = await engine.reserves(poolId)
  const reserve: Reserve = {
    reserveRisky: new Wei(res.reserveRisky),
    reserveStable: new Wei(res.reserveStable),
    liquidity: new Wei(res.liquidity),
    float: new Wei(res.float),
    debt: new Wei(res.debt),
  }
  if (log)
    console.log(`
      reserveRisky: ${formatEther(res.reserveRisky)},
      reserveStable: ${formatEther(res.reserveStable)},
      liquidity: ${formatEther(res.liquidity)},
      float: ${formatEther(res.float)}
      debt: ${formatEther(res.debt)}
    `)
  return reserve
}

export interface Position {
  owner: string
  BX1: Wei
  BY2: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
  unlocked: boolean
}

export async function getPosition(contract: Contract, owner: string, poolId: BytesLike, log?: boolean): Promise<Position> {
  const pos = await contract.getPosition(owner, poolId)
  const position: Position = {
    owner: pos.owner,
    BX1: new Wei(pos.balanceRisky),
    BY2: new Wei(pos.balanceStable),
    liquidity: new Wei(pos.liquidity),
    float: new Wei(pos.float),
    debt: new Wei(pos.debt),
    unlocked: pos.unlocked,
  }
  if (log)
    console.log(`
      owner: ${pos.owner},
      nonce: ${pos.nonce},
      BX1: ${formatEther(pos.balanceRisky)},
      BY2: ${formatEther(pos.balanceStable)},
      liquidity: ${formatEther(pos.liquidity)},
      float: ${formatEther(pos.float)},
      debt: ${formatEther(pos.debt)}
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

export async function getMargin(contract: Contract, owner: string, log?: boolean): Promise<Margin> {
  const mar = await contract.margins(owner)
  const margin: Margin = {
    owner: owner,
    BX1: new Wei(mar.BX1),
    BY2: new Wei(mar.BY2),
    unlocked: mar.unlocked,
  }
  if (log)
    console.log(`
      owner: ${owner},
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

export async function getCalibration(engine: Contract, poolId: BytesLike, log?: boolean): Promise<Calibration> {
  const cal = await engine.settings(poolId)
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

export async function getPoolParams(engine: Contract, poolId: BytesLike, log?: boolean): Promise<PoolParams> {
  const reserve: Reserve = await getReserve(engine, poolId, log)
  const calibration: Calibration = await getCalibration(engine, poolId, log)
  return { reserve, calibration }
}

export function calculateInvariant(params: PoolParams): number {
  const input: number = getTradingFunction(params.reserve.reserveRisky, params.reserve.liquidity, params.calibration)
  const invariant: Wei = params.reserve.reserveStable.sub(parseEther(input > 0.0001 ? input.toString() : '0'))
  return invariant.float
}

export function calcInvariant(reserveRisky: Wei, reserveStable: Wei, liquidity: Wei, calibration: Calibration): number {
  const input: number = getTradingFunction(reserveRisky, liquidity, calibration)
  const invariant: Wei = reserveStable.sub(parseEther(input > 0.0001 ? input.toString() : '0'))
  return invariant.float
}

export function getCreate2Address(factoryAddress: string, [stable, risky]: [string, string], bytecode: string): string {
  const encodedArguments = utils.defaultAbiCoder.encode(['address', 'address'], [stable, risky])

  const create2Inputs = ['0xff', factoryAddress, utils.keccak256(encodedArguments), utils.keccak256(bytecode)]

  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}
