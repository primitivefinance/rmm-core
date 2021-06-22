import { BytesLike } from 'ethers'
import { Wei, parseWei } from './Units'
import { getTradingFunction, getInverseTradingFunction } from './ReplicationMath'
import { getReserve, Reserve, getCalibration, Calibration, calcInvariant } from './utilities'
import { PrimitiveEngine } from '../../typechain'

export interface SwapReturn {
  deltaIn: Wei
  reserveRisky: Wei
  reserveStable: Wei
  invariant: any
}

export async function swap(
  engine: PrimitiveEngine,
  poolId: BytesLike,
  riskyForStable: boolean,
  deltaOut: Wei
): Promise<SwapReturn> {
  let swapReturn: SwapReturn = riskyForStable
    ? await swapRiskyForStable(engine, poolId, deltaOut)
    : await swapStableForRisky(engine, poolId, deltaOut)

  return swapReturn
}
export async function swapStableForRisky(engine: PrimitiveEngine, poolId: BytesLike, deltaOut: Wei): Promise<SwapReturn> {
  let reserve: Reserve = await getReserve(engine, poolId)
  let cal: Calibration = await getCalibration(engine, poolId)
  let deltaIn: Wei

  let nextRisky = reserve.reserveRisky.sub(deltaOut)
  let nextStable = parseWei(getTradingFunction(nextRisky, reserve.liquidity, cal))
  let nextInvariant = calcInvariant(nextRisky, nextStable, reserve.liquidity, cal)
  deltaIn = nextStable.gt(reserve.reserveStable)
    ? nextStable.sub(reserve.reserveStable)
    : reserve.reserveStable.sub(nextStable)
  return { deltaIn, reserveRisky: nextRisky, reserveStable: nextStable, invariant: nextInvariant }
}
export async function swapRiskyForStable(engine: PrimitiveEngine, poolId: BytesLike, deltaOut: Wei): Promise<SwapReturn> {
  let reserve: Reserve = await getReserve(engine, poolId)
  let cal: Calibration = await getCalibration(engine, poolId)
  let deltaIn: Wei

  let nextStable = reserve.reserveStable.sub(deltaOut)
  let nextRisky = parseWei(getInverseTradingFunction(nextStable, reserve.liquidity, cal))
  let nextInvariant = calcInvariant(nextRisky, nextStable, reserve.liquidity, cal)
  deltaIn = nextRisky.gt(reserve.reserveRisky) ? nextRisky.sub(reserve.reserveRisky) : reserve.reserveRisky.sub(nextRisky)
  return { deltaIn, reserveRisky: nextRisky, reserveStable: nextStable, invariant: nextInvariant }
}
