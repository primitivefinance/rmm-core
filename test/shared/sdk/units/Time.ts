import { BigNumberish } from '@ethersproject/bignumber'
/**
 * @notice Used to return seconds or years, default is seconds
 */
export class Time {
  readonly raw: number
  /**
   * @param raw  A number returned from a smart contract call
   * */
  constructor(raw: number) {
    this.raw = Math.floor(raw) // seconds
  }

  get years(): number {
    return this.raw / Time.YearInSeconds
  }

  get seconds(): number {
    return this.raw
  }

  sub(x: BigNumberish | Time): Time {
    if (x instanceof Time) x = x.raw
    return new Time(this.raw - +x.toString())
  }

  /**
   * @return A year in seconds
   */
  static get YearInSeconds(): number {
    return 31449600
  }
}
