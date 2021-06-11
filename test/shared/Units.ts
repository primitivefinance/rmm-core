import { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber, BigNumberish, BytesLike, constants, Transaction } from 'ethers'
import { formatEther, parseEther } from '@ethersproject/units'
import bn from 'bignumber.js'

export { formatEther, parseEther, BigNumber, BigNumberish, bn, BytesLike, constants, Transaction }
export const DENOMINATOR = 2 ** 64
export const MANTISSA = 10 ** 9
export const PERCENTAGE = 10 ** 4
export const YEAR = 31449600

export function fromPercentageInt(value: BigNumberish): number {
  return fromInt(toBN(value).mul(PERCENTAGE).toString())
}

export function fromInt(value: BigNumberish): number {
  const val = toBN(value.toString()).gt(0) ? value : '0'
  const numerator = parseEther('1').mul(val)
  const denominator = BigNumber.from(2).pow(64)
  const input = numerator.div(denominator)
  const output = input.div(MANTISSA)
  return parseFloat(output.toString())
}

export function fromMantissa(value: number): number {
  return value / MANTISSA
}

export function parseWei(x: BigNumberish): Wei {
  return new Wei(parseEther(x.toString()))
}

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

export function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}

export function percentage(val: string, percentage: number, add: boolean): number {
  val = parseEther(val).toString()
  return new Wei(
    toBN(val)
      .mul(add ? 100 + percentage : 100 - percentage)
      .div(100)
      .toString()
  ).float
}

export function fromWithin(val: Wei, range: number): [number, number] {
  const low = (val.float * (1 - range)) / 100
  const high = (val.float * (1 + range)) / 100
  return [low, high]
}
