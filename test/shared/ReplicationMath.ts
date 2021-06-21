import bn from 'bignumber.js'
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

export function getTradingFunction(RX1: Wei, liquidity: Wei, cal: Calibration): number {
  const deltaTime = cal.time - Math.floor(Date.now() / 1000)
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, deltaTime)
  const reserve: number = RX1.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = 1 - +reserve
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi - vol / PERCENTAGE
  const RY2 = K * std_n_cdf(input)
  return parseWei(RY2).float
}

export function getInverseTradingFunction(RY2: Wei, liquidity: Wei, cal: Calibration): number {
  const deltaTime = cal.time - Math.floor(Date.now() / 1000)
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, deltaTime)
  const reserve: number = RY2.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = reserve / K
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi + vol / PERCENTAGE
  const RX1 = 1 - std_n_cdf(input)
  return parseWei(RX1).float
}
