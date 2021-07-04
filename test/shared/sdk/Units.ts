/// Ethers Imports
import { BigNumber, BigNumberish, BytesLike, constants, Transaction, Wallet } from 'ethers'
import { formatEther, parseEther } from '@ethersproject/units'
import bn from 'bignumber.js'
export { formatEther, parseEther, BigNumber, BigNumberish, bn, BytesLike, constants, Transaction, Wallet }
export const DENOMINATOR = 2 ** 64
export const MANTISSA = 10 ** 9
export const PERCENTAGE = 10 ** 4
export const YEAR = 31449600

/// @notice Multiplies by 10**18 and returns a Wei instance of the value
export function parseWei(x: BigNumberish): Wei {
  return new Wei(parseEther(x.toString()))
}

/// @notice Converts to a BigNumber
export function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}

/// @notice Used to parse integer128s which are returned by the smart contracts
export class Integer64x64 {
  readonly raw: BigNumberish
  constructor(raw: BigNumberish) {
    this.raw = raw
  }

  /// @notice Integer divided by 2^64
  get parsed(): number {
    return parseFloat(this.raw.toString()) / Math.pow(2, 64)
  }

  get integer(): number {
    return Math.floor(this.parsed * MANTISSA)
  }

  /// @return Integer scaled down by mantissa
  get normalized(): number {
    return this.integer / MANTISSA
  }

  get percentage(): number {
    return this.normalized / PERCENTAGE
  }
}

/// @notice Used to return seconds or years, default is seconds
export class Time {
  readonly raw: number
  constructor(raw: number) {
    this.raw = Math.floor(raw) // seconds
  }

  get years(): number {
    return this.raw / YEAR
  }

  get seconds(): number {
    return this.raw
  }
}

/// @notice Used for integer percentages scaled by PERCENTAGE constant
export class Percentage {
  readonly raw: number
  constructor(raw: number) {
    this.raw = raw * PERCENTAGE
  }

  get float(): number {
    return this.raw / PERCENTAGE
  }
}

/// @notice Used for integer values
export class Mantissa {
  readonly raw: BigNumber
  readonly mantissa: number
  constructor(raw: BigNumberish, mantissa?: number) {
    this.mantissa = mantissa ? mantissa : MANTISSA
    this.raw = toBN(Math.floor(+raw * this.mantissa))
  }

  get float(): number {
    return parseFloat(this.raw.div(this.mantissa).toString())
  }
}

/// @notice Used for Smart Contract uint values
export class Wei {
  readonly val: BigNumber
  constructor(val: BigNumberish) {
    this.val = toBN(val)
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
    if (+x.toString() <= 0) return new Wei('0')
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
