/// Ethers Imports
import { BigNumber, BigNumberish } from 'ethers'
import { formatEther, parseEther } from '@ethersproject/units'

/// @notice Multiplies by 10**18 and returns a Wei instance of the value
export function parseWei(x: BigNumberish): Wei {
  return new Wei(parseEther(x.toString()))
}

export function parseInt64x64(x: BigNumberish): Integer64x64 {
  return new Integer64x64(toBN(parseInt(x.toString())).mul(Integer64x64.Denominator))
}

/// @notice Converts to a BigNumber
export function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}

/// @notice EVM int128 representation
export class Integer64x64 {
  readonly raw: BigNumber

  /**
   * @notice Int128s are stored as numerators that all have a denominator of 2^64
   * @param raw  An int128 returned from a smart contract call
   * */
  constructor(raw: BigNumber) {
    this.raw = raw
  }

  /// @return Raw divided by 2^64
  get parsed(): number {
    return parseFloat(this.raw.div(Integer64x64.Denominator).toString())
  }

  /// @return Parsed value with `MANTISSA` decimals as an integer
  get integer(): number {
    return Math.floor(this.parsed * Wei.Mantissa)
  }

  /// @return Parsed value floored and with MANTISSA decimals
  get float(): number {
    return this.integer / Wei.Mantissa
  }

  /// @return float value in units of percentages
  get percentage(): number {
    return this.float / Percentage.Mantissa
  }

  /**
   * @returns All int128 values in the smart contracts are numerators with a 2^64 denominator
   */
  static get Denominator(): BigNumber {
    return toBN(2).pow(64)
  }
}

/// @notice Used to return seconds or years, default is seconds
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
   * @returns A year in seconds
   */
  static get YearInSeconds(): number {
    return 31449600
  }
}

/// @notice EVM int128 percentage representation (values scaled by percentage contsant)
export class Percentage {
  readonly raw: BigNumber
  /**
   * @param raw  A scaled percentage value returned from a smart contract call
   * */
  constructor(raw: BigNumber) {
    this.raw = raw
  }

  get float(): number {
    return parseFloat(this.raw.div(Percentage.Mantissa).toString())
  }

  /**
   * @returns Mantissa used to scale percentages in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 4)
  }
}

/// @notice EVM Uint representation for wei values
export class Wei {
  readonly val: BigNumber
  /**
   * @param raw  A `wei` amount of uint
   * */
  constructor(val: BigNumber) {
    this.val = val
  }

  get raw(): BigNumber {
    return this.val
  }

  get parsed(): string {
    return formatEther(this.val)
  }

  get float(): number {
    return parseFloat(formatEther(this.val))
  }

  add(x: BigNumberish | Wei): Wei {
    if (x instanceof Wei) x = x.raw
    return new Wei(this.val.add(x.toString()))
  }

  sub(x: BigNumberish | Wei): Wei {
    if (x instanceof Wei) x = x.raw
    return new Wei(this.val.sub(x.toString()))
  }

  mul(x: BigNumberish | Wei): Wei {
    if (x instanceof Wei) x = x.raw
    return new Wei(this.val.mul(x.toString()))
  }

  div(x: BigNumberish | Wei): Wei {
    if (x instanceof Wei) x = x.raw
    if (+x.toString() <= 0) return parseWei('0')
    return new Wei(this.val.div(x.toString()))
  }

  gt(x: BigNumberish | Wei): boolean {
    if (x instanceof Wei) x = x.raw
    return this.val.gt(x.toString())
  }

  lt(x: BigNumberish | Wei): boolean {
    if (x instanceof Wei) x = x.raw
    return this.val.lt(x.toString())
  }

  log() {
    console.log(this.parsed)
  }

  /**
   * @returns Mantissa used to scale uint values in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 9)
  }
}
