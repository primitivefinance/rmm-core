import { Calibration } from '../shared/calibration'
import { parseWei, Time, parsePercentage, parseTime } from 'web3-units'
import { Configs } from '../../types'

export const DEFAULT_CONFIG: Calibration = new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(0.0015))

export default function createTestConfigs(
  strikes: number[],
  sigmas: number[],
  maturities: number[],
  spots: number[]
): Configs {
  const cStrikes = curvesWithStrikes(strikes)
  const cSigmas = curvesWithSigmas(sigmas)
  const cMaturities = curvesWithMaturities(maturities)
  const cSpots = curvesWithSpotPrices(spots)

  return {
    all: [...cStrikes, ...cSigmas, ...cMaturities, ...cSpots],
    strikes: cStrikes,
    sigmas: cSigmas,
    maturities: cMaturities,
    spots: cSpots,
  }
}

export function curvesWithStrikes(strikes: number[]): Calibration[] {
  return strikes
    .map(parseWei)
    .map(
      (strike) =>
        new Calibration(
          strike.float,
          DEFAULT_CONFIG.sigma.float,
          DEFAULT_CONFIG.maturity.raw,
          DEFAULT_CONFIG.lastTimestamp.raw,
          DEFAULT_CONFIG.spot.float
        )
    )
}

export function curvesWithSigmas(sigmas: number[]): Calibration[] {
  return sigmas
    .map(parsePercentage)
    .map(
      (sigma) =>
        new Calibration(
          DEFAULT_CONFIG.strike.float,
          sigma.float,
          DEFAULT_CONFIG.maturity.raw,
          DEFAULT_CONFIG.lastTimestamp.raw,
          DEFAULT_CONFIG.spot.float
        )
    )
}

export function curvesWithMaturities(maturities: number[]): Calibration[] {
  return maturities
    .map(parseTime)
    .map(
      (maturity) =>
        new Calibration(
          DEFAULT_CONFIG.strike.float,
          DEFAULT_CONFIG.sigma.float,
          maturity.raw,
          DEFAULT_CONFIG.lastTimestamp.raw,
          DEFAULT_CONFIG.spot.float
        )
    )
}

export function curvesWithSpotPrices(spots: number[]): Calibration[] {
  return spots
    .map(parseWei)
    .map(
      (spot) =>
        new Calibration(
          DEFAULT_CONFIG.strike.float,
          DEFAULT_CONFIG.sigma.float,
          DEFAULT_CONFIG.maturity.raw,
          DEFAULT_CONFIG.lastTimestamp.raw,
          spot.float
        )
    )
}

export function curvesWithFees(fees: number[]): Calibration[] {
  return fees
    .map(parsePercentage)
    .map(
      (fee) =>
        new Calibration(
          DEFAULT_CONFIG.strike.float,
          DEFAULT_CONFIG.sigma.float,
          DEFAULT_CONFIG.maturity.raw,
          DEFAULT_CONFIG.lastTimestamp.raw,
          DEFAULT_CONFIG.spot.float,
          fee
        )
    )
}
