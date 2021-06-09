import { Wei, toBN, formatEther, parseEther, parseWei, fromInt, BigNumber, BigNumberish } from './Units'
import { BytesLike, utils } from 'ethers'
import bn from 'bignumber.js'
import { Contract } from '@ethersproject/contracts'

import { getTradingFunction, getInverseTradingFunction } from './ReplicationMath'

import { IUniswapV3Factory, IERC20 } from '../../typechain'

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

export function encodePriceSqrt(reserve1: BigNumberish, reserve0: BigNumberish): BigNumber {
  return BigNumber.from(
    new bn(reserve1.toString()).div(reserve0.toString()).sqrt().multipliedBy(new bn(2).pow(96)).integerValue(3).toString()
  )
}

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing
export const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing

export const deriveUniPoolAddress = async (factory: IUniswapV3Factory, fee: BigNumberish, tokens: Array<IERC20>) => {
  const [t0, t1] = tokens

  const poolAddr =
    t0.address.toLowerCase() < t1.address.toLowerCase()
      ? await factory.getPool(t0.address, t1.address, fee)
      : await factory.getPool(t1.address, t0.address, fee)

  return poolAddr
}

export function allocate(deltaL: Wei, params: PoolParams): [Wei, Wei, PoolParams, number] {
  const { RX1, RY2, liquidity, float, debt } = params.reserve
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
      debt: debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(post)
  return [deltaX, deltaY, post, postInvariant]
}

export function remove(deltaL: Wei, params: PoolParams): [Wei, Wei, PoolParams, number] {
  const { RX1, RY2, liquidity, float, debt } = params.reserve
  const deltaX = deltaL.mul(RX1).div(liquidity)
  const deltaY = deltaL.mul(RY2).div(liquidity)
  const postRX1 = RX1.sub(deltaX)
  const postRY2 = RY2.sub(deltaY)
  const postLiquidity = liquidity.sub(deltaL)
  const post: PoolParams = {
    reserve: {
      RX1: postRX1,
      RY2: postRY2,
      liquidity: postLiquidity,
      float: float,
      debt: debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(post)
  return [deltaX, deltaY, post, postInvariant]
}

// ===== Swaps =====

export interface Swap {
  deltaIn: Wei
  deltaOut: Wei
  postParams: PoolParams
  postInvariant: number
}

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
  const RX1: Wei = params.reserve.RX1
  const RY2: Wei = params.reserve.RY2
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let postRX1: Wei = new Wei('0')
  let postRY2: Wei = new Wei('0')

  if (addXRemoveY) {
    postRX1 = calcRX1WithYOut(deltaOut, params)
    postRY2 = RY2.sub(deltaOut)
    deltaIn = postRX1.gt(RX1) ? postRX1.sub(RX1) : RX1.sub(postRX1)
  } else {
    postRY2 = calcRY2WithXOut(deltaOut, params)
    postRX1 = RX1.sub(deltaOut)
    deltaIn = postRY2.gt(RY2) ? postRY2.sub(RY2) : RY2.sub(postRY2)
  }

  const postParams: PoolParams = {
    reserve: {
      RX1: postRX1,
      RY2: postRY2,
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
  const RX1: Wei = params.reserve.RX1
  const RY2: Wei = params.reserve.RY2
  const invariant: Wei = parseWei(fromInt(invariantInt128))
  let postRX1: Wei = new Wei('0')
  let postRY2: Wei = new Wei('0')

  if (addXRemoveY) {
    postRX1 = RX1.add(deltaIn)
    postRY2 = calcRY2WithXIn(postRX1, params)
    deltaOut = postRY2.gt(RY2) ? postRY2.sub(RY2) : RY2.sub(postRY2)
  } else {
    let nextRY2 = calcRY2WithXIn(deltaIn, params)
    postRY2 = invariant.add(nextRY2)
    postRX1 = RX1.add(deltaIn)
    deltaOut = postRX1.gt(RX1) ? postRX1.sub(RX1) : RX1.sub(postRX1)
  }

  const postParams: PoolParams = {
    reserve: {
      RX1: postRX1,
      RY2: postRY2,
      liquidity: params.reserve.liquidity,
      float: params.reserve.float,
      debt: params.reserve.debt,
    },
    calibration: params.calibration,
  }
  const postInvariant: number = calculateInvariant(postParams)
  return { deltaIn, deltaOut, postParams, postInvariant }
}

export function calcRX1WithYOut(deltaY: Wei, params: PoolParams): Wei {
  const RY2: Wei = params.reserve.RY2
  const nextRY2 = RY2.sub(deltaY)
  return parseWei(calcRX1WithRY2(nextRY2, params))
}

export function calcRY2WithXOut(deltaX: Wei, params: PoolParams): Wei {
  const RX1 = params.reserve.RX1
  const nextRX1 = RX1.sub(deltaX)
  return parseWei(calcRY2WithRX1(nextRX1, params))
}

export function calcRX1WithYIn(deltaY: Wei, params: PoolParams): Wei {
  const RY2: Wei = params.reserve.RY2
  const nextRY2 = RY2.add(deltaY)
  return parseWei(calcRX1WithRY2(nextRY2, params))
}

export function calcRY2WithXIn(deltaX: Wei, params: PoolParams): Wei {
  const RX1 = params.reserve.RX1
  const nextRX1 = RX1.add(deltaX)
  return parseWei(calcRY2WithRX1(nextRX1, params))
}

export function calcRX1WithRY2(RY2: Wei, params: PoolParams) {
  return getInverseTradingFunction(RY2, params.reserve.liquidity, params.calibration)
}

export function calcRY2WithRX1(RX1: Wei, params: PoolParams) {
  return getTradingFunction(RX1, params.reserve.liquidity, params.calibration)
}

export interface Reserve {
  RX1: Wei
  RY2: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
}

export async function getReserve(engine: Contract, poolId: BytesLike, log?: boolean): Promise<Reserve> {
  const res = await engine.reserves(poolId)
  const reserve: Reserve = {
    RX1: new Wei(res.RX1),
    RY2: new Wei(res.RY2),
    liquidity: new Wei(res.liquidity),
    float: new Wei(res.float),
    debt: new Wei(res.debt),
  }
  if (log)
    console.log(`
      RX1: ${formatEther(res.RX1)},
      RY2: ${formatEther(res.RY2)},
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

export async function getPosition(contract: Contract, owner: string, pid: BytesLike, log?: boolean): Promise<Position> {
  const pos = await contract.getPosition(owner, pid)
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
  const input: number = getTradingFunction(params.reserve.RX1, params.reserve.liquidity, params.calibration)
  const invariant: Wei = params.reserve.RY2.sub(parseEther(input > 0.0001 ? input.toString() : '0'))
  return invariant.float
}

export function getCreate2Address(factoryAddress: string, [stable, risky]: [string, string], bytecode: string): string {
  const encodedArguments = utils.defaultAbiCoder.encode(['address', 'address'], [stable, risky])

  const create2Inputs = ['0xff', factoryAddress, utils.keccak256(encodedArguments), utils.keccak256(bytecode)]

  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}
