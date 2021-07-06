import { BigNumber, BigNumberish } from 'ethers'
import { Percentage } from './Percentage'
import { Wei } from './Wei'
export function parseInt64x64(x: BigNumberish): Integer64x64 {
  return new Integer64x64(toBN(parseInt(x.toString())).mul(Integer64x64.Denominator))
}

/**
 * @notice Converts to a BigNumber
 */
export function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}

/**
 *  @notice EVM int128 representation
 */
export class Integer64x64 {
  readonly raw: BigNumber

  /**
   * @notice Int128s are stored as numerators that all have a denominator of 2^64
   * @param raw  An int128 returned from a smart contract call
   * */
  constructor(raw: BigNumber) {
    this.raw = raw
  }

  /**
   * @return Raw divided by 2^64
   */
  get parsed(): number {
    return parseFloat(this.raw.div(Integer64x64.Denominator).toString())
  }

  /**
   * @return Parsed value with `MANTISSA` decimals as an integer
   */
  get integer(): number {
    return Math.floor(this.parsed * Wei.Mantissa)
  }

  /**
   * @return Parsed value floored and with MANTISSA decimals
   */
  get float(): number {
    return this.integer / Wei.Mantissa
  }

  /**
   * @return float value in units of percentages
   */
  get percentage(): number {
    return this.float / Percentage.Mantissa
  }

  /**
   * @return All int128 values in the smart contracts are numerators with a 2^64 denominator
   */
  static get Denominator(): BigNumber {
    return toBN(2).pow(64)
  }
}
