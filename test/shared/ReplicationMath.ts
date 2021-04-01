import bn from 'bignumber.js'
import { Wei, PERCENTAGE, YEAR, formatEther, parseEther, toBN, BigNumberish } from './Units'
import { inverse_std_n_cdf, std_n_cdf } from './CumulativeDistributionFunction'
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
  const input = (inverse_std_n_cdf(1 - +reserve) * PERCENTAGE - vol) / PERCENTAGE
  const RY2 = K * std_n_cdf(input)
  return parseFloat(RY2.toString())
}
