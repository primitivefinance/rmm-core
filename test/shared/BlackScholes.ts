import { std_n_cdf } from './CumulativeNormalDistribution'
import { Calibration } from './utilities'
import { YEAR, PERCENTAGE, Wei, formatEther } from './Units'

export function moneyness(cal: Calibration, assetPrice: Wei): number {
  const spot = assetPrice.float
  const strike = +formatEther(cal.strike)
  return Math.log(spot / strike)
}

export function calculateD1(cal: Calibration, assetPrice: Wei): number {
  const timeToExpiry = cal.time / YEAR
  const spot = assetPrice.float
  const strike = +formatEther(cal.strike)
  const vol = cal.sigma / PERCENTAGE

  if (timeToExpiry < 0) return 0

  return (Math.log(spot / strike) + (Math.pow(vol, 2) / 2) * timeToExpiry) / (vol * Math.sqrt(timeToExpiry))
}

export function calculateDelta(cal: Calibration, assetPrice: Wei): number {
  const d1 = calculateD1(cal, assetPrice)
  const delta: number = std_n_cdf(d1)
  return delta
}
