import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { formatUnits, parseEther } from '@ethersproject/units'

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
  readonly raw: BigNumber
  readonly decimals: number
  /**
   * @param raw  Value used or returned during smart contract calls for uints
   * */
  constructor(raw: BigNumber, decimals: number = 18) {
    this.raw = raw
    this.decimals = decimals
  }

  get parsed(): string {
    return formatUnits(this.raw, this.decimals)
  }

  /**
   * @return Float value used in smart contract calls
   */
  get float(): number {
    return parseFloat(formatUnits(this.raw, this.decimals))
  }

  add(x: BigNumberish | Wei): Wei {
    return new Wei(this.raw.add(x.toString()))
  }

  sub(x: BigNumberish | Wei): Wei {
    return new Wei(this.raw.sub(x.toString()))
  }

  mul(x: BigNumberish | Wei): Wei {
    return new Wei(this.raw.mul(x.toString()))
  }

  div(x: BigNumberish | Wei): Wei {
    if (+x.toString() <= 0) return parseWei('0')
    return new Wei(this.raw.div(x.toString()))
  }

  gt(x: BigNumberish | Wei): boolean {
    return this.raw.gt(x.toString())
  }

  lt(x: BigNumberish | Wei): boolean {
    return this.raw.lt(x.toString())
  }

  log() {
    console.log(this.parsed)
  }

  toString(): string {
    return this.raw.toString()
  }

  /**
   * @return Mantissa used to scale uint values in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 9)
  }
}
