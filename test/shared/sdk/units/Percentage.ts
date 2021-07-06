import { BigNumber } from '@ethersproject/bignumber'
/**
 * @notice EVM int128 percentage representation (values scaled by percentage contsant)
 */
export class Percentage {
  readonly raw: BigNumber
  /**
   * @param raw  A scaled percentage value used or returned during smart contract calls
   * */
  constructor(raw: BigNumber) {
    this.raw = raw
  }

  /**
   * @return Float value used in javascript math
   */
  get float(): number {
    return parseFloat(this.raw.div(Percentage.Mantissa).toString())
  }

  /**
   * @return Mantissa used to scale percentages in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 4)
  }
}
