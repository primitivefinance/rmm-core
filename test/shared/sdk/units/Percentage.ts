import { BigNumber } from '@ethersproject/bignumber'
/**
 * @notice EVM int128 percentage representation (values scaled by percentage contsant)
 */
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
   * @return Mantissa used to scale percentages in the smart contracts
   */
  static get Mantissa(): number {
    return Math.pow(10, 4)
  }
}
