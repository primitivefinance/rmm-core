/// SDK Imports
import { std_n_cdf } from './CumulativeNormalDistribution'
import { Calibration } from './Structs'
import { Wei, Time } from './Units'

export function moneyness(cal: Calibration, spot: Wei): number {
  const strike = cal.strike.float
  return Math.log(spot.float / strike)
}

export function calculateD1(cal: Calibration, spot: Wei): number {
  const timeToExpiry = new Time(cal.maturity.seconds - cal.lastTimestamp.seconds).years
  const strike = cal.strike.float
  const vol = cal.sigma.float

  if (timeToExpiry < 0) return 0

  return (Math.log(spot.float / strike) + (Math.pow(vol, 2) / 2) * timeToExpiry) / (vol * Math.sqrt(timeToExpiry))
}

export function callDelta(cal: Calibration, spot: Wei): number {
  const d1 = calculateD1(cal, spot)
  const delta: number = std_n_cdf(d1)
  return delta
}
