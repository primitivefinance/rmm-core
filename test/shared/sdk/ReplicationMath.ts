/// SDK Imports
import { PERCENTAGE } from './Units'
import { inverse_std_n_cdf, std_n_cdf } from './CumulativeNormalDistribution'

export function getProportionalVol(sigma: number, tau: number): number {
  return sigma * Math.sqrt(tau)
}

export function getTradingFunction(
  reserveRisky: number,
  liquidity: number,
  strike: number,
  sigma: number,
  tau: number
): number {
  const K = strike
  const vol = getProportionalVol(sigma, tau)
  if (vol <= 0) return 0
  const reserve: number = reserveRisky / liquidity
  const inverseInput: number = 1 - +reserve
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi - vol
  const reserveStable = K * std_n_cdf(input)
  return reserveStable
}

export function getInverseTradingFunction(
  reserveStable: number,
  liquidity: number,
  strike: number,
  sigma: number,
  tau: number
): number {
  const K = strike
  const vol = getProportionalVol(sigma, tau)
  if (vol <= 0) return 0
  const reserve: number = reserveStable / liquidity
  const inverseInput: number = reserve / K
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi + vol
  const reserveRisky = 1 - std_n_cdf(input)
  return reserveRisky
}

export function calcInvariant(
  reserveRisky: number,
  reserveStable: number,
  liquidity: number,
  strike: number,
  sigma: number,
  tau: number
): number {
  const input: number = getTradingFunction(reserveRisky, liquidity, strike, sigma, tau)
  const invariant: number = reserveStable - input
  return invariant
}
