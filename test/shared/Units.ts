import { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber, BigNumberish } from 'ethers'
import { formatEther, parseEther } from '@ethersproject/units'
import bn from 'bignumber.js'

export { formatEther, parseEther, BigNumber, BigNumberish, bn }
export const DENOMINATOR = 2 ** 64
export const MANTISSA = 10 ** 9
export const PERCENTAGE = 10 ** 4
export const YEAR = 31449600

export function convertFromPercentageInt(value: BigNumberish): number {
  return convertFromInt(toBN(value).mul(PERCENTAGE).toString())
}

export function convertFromInt(value: BigNumberish): number {
  return Number(toBN(MANTISSA).mul(value).div(BigNumber.from(2).pow(64))) / MANTISSA
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
