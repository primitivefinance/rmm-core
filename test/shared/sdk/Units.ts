/// Ethers Imports
import { BigNumber, BigNumberish, BytesLike, constants, Transaction, Wallet } from 'ethers'
import { formatEther, parseEther } from '@ethersproject/units'
import bn from 'bignumber.js'
export { formatEther, parseEther, BigNumber, BigNumberish, bn, BytesLike, constants, Transaction, Wallet }
export const DENOMINATOR: BigNumber = toBN(2).pow(64)
export const MANTISSA = 10 ** 9
export const PERCENTAGE = 10 ** 4
export const YEAR = 31449600

/// @notice Multiplies by 10**18 and returns a Wei instance of the value
export function parseWei(x: BigNumberish): Wei {
  return new Wei(parseEther(x.toString()))
}

export function parseInt64x64(x: BigNumberish): Integer64x64 {
  return new Integer64x64(toBN(parseInt(x.toString())).mul(DENOMINATOR))
}

/// @notice Converts to a BigNumber
export function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}

/// @notice EVM int128 representation
export class Integer64x64 {
  readonly raw: BigNumber

  /**
   * @param raw  An int128 returned from a smart contract call
   * */
  constructor(raw: BigNumber) {
    this.raw = raw
  }

  /// @return Raw divided by 2^64
  get parsed(): number {
    return parseFloat(this.raw.div(DENOMINATOR).toString())
  }

  /// @return Parsed value with `MANTISSA` decimals as an integer
  get integer(): number {
    return Math.floor(this.parsed * MANTISSA)
  }

  /// @return Parsed value floored and with MANTISSA decimals
  get float(): number {
    return this.integer / MANTISSA
  }

  /// @return float value in units of percentages
  get percentage(): number {
    return this.float / PERCENTAGE
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
    return this.raw / YEAR
  }

  get seconds(): number {
    return this.raw
  }

  sub(x: BigNumberish | Time): Time {
    if (x instanceof Time) x = x.raw
    return new Time(this.raw - +x.toString())
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
    return parseFloat(this.raw.div(PERCENTAGE).toString())
  }
}

/// @notice Used for integer values
export class Mantissa {
  readonly raw: BigNumber
  readonly mantissa: number
  constructor(raw: BigNumberish, mantissa?: number) {
    this.mantissa = mantissa ? mantissa : MANTISSA
    this.raw = toBN(Math.floor(+raw.toString() * this.mantissa))
  }

  get float(): number {
    return parseFloat(this.raw.div(this.mantissa).toString())
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
}
