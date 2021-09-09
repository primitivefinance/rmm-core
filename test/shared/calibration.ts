import { parseWei, Percentage, Time, Wei, toBN, parsePercentage } from 'web3-units'
import { callDelta, callPremium } from '@primitivefinance/v2-math'
import { computePoolId } from './utils'

/**
 * @notice Calibration Struct; Class representation of each Curve's parameters
 */
export class Calibration {
  /**
   * @notice Strike price with decimals = precisionStable
   */
  public readonly strike: Wei
  /**
   * @notice Volatility as a Percentage instance with 4 decimals
   */
  public readonly sigma: Percentage
  /**
   * @notice Time class with a raw value in seconds
   */
  public readonly maturity: Time
  /**
   * @notice Time until expiry is calculated from the difference of current timestamp and this
   */
  public readonly lastTimestamp: Time
  /**
   * @notice Price of risky token in stable token units with precision stable decimals
   */
  public readonly spot: Wei
  /**
   * @notice Swap fee charged on pool swaps
   */
  public readonly fee: Percentage
  /**
   * @notice Scaling factor of risky asset, 18 - risky decimals
   */
  public readonly precisionRisky: number
  /**
   * @notice Scaling factor of stable asset, 18 - stable decimals
   */
  public readonly precisionStable: number

  /**
   *
   * @param strike Strike price as a float
   * @param sigma Volatility percentage as a float, e.g. 1 = 100%
   * @param maturity Timestamp in seconds
   * @param lastTimestamp Timestamp in seconds
   * @param spot Value of risky asset in units of riskless asset
   */
  constructor(
    strike: number,
    sigma: number,
    maturity: number,
    lastTimestamp: number,
    spot: number,
    fee: Percentage = new Percentage(toBN(0)),
    decimalsRisky: number = 18,
    decimalsStable: number = 18
  ) {
    this.strike = parseWei(strike, decimalsStable)
    this.sigma = parsePercentage(sigma)
    this.maturity = new Time(maturity) // in seconds, because `block.timestamp` is in seconds
    this.lastTimestamp = new Time(lastTimestamp) // in seconds, because `block.timestamp` is in seconds
    this.spot = parseWei(spot, decimalsStable)
    this.fee = fee
    this.precisionRisky = 18 - decimalsRisky
    this.precisionStable = 18 - decimalsStable
  }

  /**
   * @returns Time until expiry
   */
  get tau(): Time {
    return this.maturity.sub(this.lastTimestamp)
  }

  /**
   * @returns Change in pool premium wrt change in underlying spot price
   */
  get delta(): number {
    return callDelta(this.strike.float, this.sigma.float, this.tau.years, this.spot.float)
  }

  /**
   * @returns Black-Scholes implied premium
   */
  get premium(): number {
    return callPremium(this.strike.float, this.sigma.float, this.tau.years, this.spot.float)
  }

  /**
   * @returns Spot price is above strike price
   */
  get inTheMoney(): boolean {
    return this.strike.float >= this.spot.float
  }

  poolId(engine: string): string {
    return computePoolId(engine, this.maturity.raw, this.sigma.raw, this.strike.div(Math.pow(10, this.precisionRisky)).raw)
  }
}
