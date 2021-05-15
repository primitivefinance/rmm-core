import bn from 'bignumber.js'
import { Wei, PERCENTAGE, YEAR, formatEther, parseEther, toBN, BigNumberish, parseWei } from './Units'
import { inverse_std_n_cdf, std_n_cdf } from './CumulativeNormalDistribution'
import { Calibration } from './Engine'

export function getProportionalVol(sigma: BigNumberish, time: BigNumberish): number {
  return Number(
    toBN(parseFloat(sigma.toString())).mul(toBN(new bn(parseFloat(time.toString())).div(YEAR).sqrt().toString()))
  )
}

export function getTradingFunction(RX1: Wei, liquidity: Wei, cal: Calibration): number {
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, cal.time)
  const reserve: number = RX1.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = 1 - +reserve
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi - vol / PERCENTAGE
  const RY2 = K * std_n_cdf(input)
  return parseWei(RY2).float
}

export function getInverseTradingFunction(RY2: Wei, liquidity: Wei, cal: Calibration): number {
  const K = +formatEther(cal.strike)
  const vol = getProportionalVol(cal.sigma, cal.time)
  const reserve: number = RY2.mul(parseEther('1')).div(liquidity).float
  const inverseInput: number = reserve / K
  const phi: number = inverse_std_n_cdf(inverseInput)
  const input = phi + vol / PERCENTAGE
  const RX1 = 1 - std_n_cdf(input)
  return parseWei(RX1).float
}
