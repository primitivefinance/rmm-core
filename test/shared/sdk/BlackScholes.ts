/// SDK Imports
import { std_n_cdf } from './CumulativeNormalDistribution'

export function moneyness(strike: number, spot: number): number {
  return Math.log(spot / strike)
}

export function calculateD1(strike: number, sigma: number, tau: number, spot: number): number {
  if (tau < 0) return 0
  return (Math.log(spot / strike) + (Math.pow(sigma, 2) / 2) * tau) / (sigma * Math.sqrt(tau))
}

export function callDelta(strike: number, sigma: number, tau: number, spot: number): number {
  const d1 = calculateD1(strike, sigma, tau, spot)
  const delta: number = std_n_cdf(d1)
  return delta
}
