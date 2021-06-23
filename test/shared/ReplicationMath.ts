import { Wei, PERCENTAGE, YEAR, formatEther, parseEther, toBN, BigNumberish, parseWei, MANTISSA } from './Units'
import { inverse_std_n_cdf, std_n_cdf } from './CumulativeNormalDistribution'
import { Calibration } from './utilities'

/// @notice volatility * sqrt(timeUntilExpiry)
export function getProportionalVol(sigma: BigNumberish, time: BigNumberish): number {
  let vol = parseFloat(sigma.toString())
  let secondsDelta = parseFloat(time.toString())
  let yearDelta = secondsDelta / YEAR
  let sqrtTimeDelta = Math.sqrt(yearDelta)
  return vol * sqrtTimeDelta
}

export function getTradingFunction(reserveRisky: Wei, liquidity: Wei, cal: Calibration): number {
  const deltaTime = cal.time - Math.floor(Date.now() / 1000)
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, deltaTime)
  const reserve: number = reserveRisky.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = 1 - +reserve
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi - vol / PERCENTAGE
  const reserveStable = K * std_n_cdf(input)
  return parseWei(reserveStable).float
}

export function getInverseTradingFunction(reserveStable: Wei, liquidity: Wei, cal: Calibration): number {
  const deltaTime = cal.time - Math.floor(Date.now() / 1000)
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, deltaTime)
  const reserve: number = reserveStable.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = reserve / K
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi + vol / PERCENTAGE
  const reserveRisky = 1 - std_n_cdf(input)
  return parseWei(reserveRisky).float
}
