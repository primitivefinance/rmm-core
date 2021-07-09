/// SDK Imports
import { std_n_cdf } from './CumulativeNormalDistribution'

/**
 * @param strike Strike price of option
 * @param spot Spot price of underlying asset
 * @returns log(spot / strike)
 */
export function moneyness(strike: number, spot: number): number {
  return Math.log(spot / strike)
}

/**
 * @notice Calculates the d1 auxiliary variable in the black-scholes formula
 * @param strike Strike price of option, as a float
 * @param sigma Implied volatility of option, as a float
 * @param tau Time until expiry, in years
 * @param spot Reference spot price of underlying asset, as a float
 * @returns (Log(spot / strike) + sigma^2 / 2 * tau) / (sigma * sqrt(tau))
 */
export function calculateD1(strike: number, sigma: number, tau: number, spot: number): number {
  if (tau < 0) return 0
  return (Math.log(spot / strike) + (Math.pow(sigma, 2) / 2) * tau) / (sigma * Math.sqrt(tau))
}

/**
 * @returns Greek `delta` of a call option with parameters `strike`, `sigma,` and `tau`
 */
export function callDelta(strike: number, sigma: number, tau: number, spot: number): number {
  const d1 = calculateD1(strike, sigma, tau, spot)
  const delta: number = std_n_cdf(d1)
  return delta
}
