/// SDK Imports
import { Calibration } from './Structs'
import { Wei, PERCENTAGE, parseEther, parseWei } from './Units'
import { inverse_std_n_cdf, std_n_cdf } from './CumulativeNormalDistribution'

export function getProportionalVol(sigma: number, time: number): number {
  return sigma * Math.sqrt(time)
}

export function getTradingFunction(risky: Wei, liquidity: Wei, cal: Calibration): number {
  const K = cal.strike.float
  const vol = getProportionalVol(cal.sigma.float, cal.maturity.years)
  if (vol <= 0) return 0
  const reserve: number = risky.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = 1 - +reserve
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi - vol / PERCENTAGE
  const stable = K * std_n_cdf(input)
  return parseWei(stable).float
}

export function getInverseTradingFunction(stable: Wei, liquidity: Wei, cal: Calibration): number {
  const K = cal.strike.float
  const vol = getProportionalVol(cal.sigma.float, cal.maturity.years)
  if (vol <= 0) return 0
  const reserve: number = stable.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = reserve / K
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi + vol / PERCENTAGE
  const risky = 1 - std_n_cdf(input)
  return parseWei(risky).float
}

export function calcInvariant(reserveRisky: Wei, reserveStable: Wei, liquidity: Wei, calibration: Calibration): number {
  const input: number = getTradingFunction(reserveRisky, liquidity, calibration)
  const invariant: Wei = reserveStable.sub(parseWei(input > 0.0001 ? input.toString() : '0').raw)
  return invariant.float
}
