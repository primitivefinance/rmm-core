import { parseWei, Percentage, Time, Wei, toBN } from 'web3-units'
import { callDelta, callPremium } from '@primitivefinance/v2-math'

/**
 * @notice Calibration Struct; Class representation of each Curve's parameters
 * @dev    Call options only.
 */
export class Calibration {
  public readonly strike: Wei
  public readonly sigma: Percentage
  public readonly maturity: Time
  public readonly lastTimestamp: Time
  public readonly spot: Wei
  public readonly fee: Percentage

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
    fee: Percentage = new Percentage(toBN(0))
  ) {
    this.strike = parseWei(strike)
    this.sigma = new Percentage(toBN(sigma * Percentage.Mantissa))
    this.maturity = new Time(maturity) // in seconds, because `block.timestamp` is in seconds
    this.lastTimestamp = new Time(lastTimestamp) // in seconds, because `block.timestamp` is in seconds
    this.spot = parseWei(spot)
    this.fee = fee
  }

  /**
   * @returns Time until expiry
   */
  get tau(): Time {
    return this.maturity.sub(this.lastTimestamp)
  }

  /**
   * @returns Change in option premium wrt change in underlying spot price
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
}
