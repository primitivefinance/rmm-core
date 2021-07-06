import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { formatEther, parseEther } from '@ethersproject/units'

/**
 * @notice Multiplies by 10**18 and returns a Wei instance of the value
 */
export function parseWei(x: BigNumberish): Wei {
  return new Wei(parseEther(x.toString()))
}

/**
 * @notice EVM Uint representation for wei values
 */
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
   * @return Mantissa used to scale uint values in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 9)
  }
}
