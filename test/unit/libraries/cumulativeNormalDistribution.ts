import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestCumulativeNormalDistribution } from '../../../typechain'
import { fromMantissa, fromInt, parseWei, MANTISSA } from '../../shared/Units'
import { std_n_cdf, inverse_std_n_cdf } from '../../shared/CumulativeNormalDistribution'
import loadContext from '../context'

describe('testCumulativeNormalDistribution', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testCumulativeNormalDistribution'], async () => {})
  })

  describe('cumulative', function () {
    let cumulative: TestCumulativeNormalDistribution

    beforeEach(async function () {
      cumulative = this.contracts.testCumulativeNormalDistribution
    })

    it('cdf', async function () {
      let x = 1
      let cdf = Math.floor(std_n_cdf(x) * MANTISSA) / MANTISSA
      expect(fromMantissa(fromInt(await cumulative.cdf(x)))).to.be.eq(cdf)
    })
    it('icdf', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      expect(parseFloat((await cumulative.icdf(parseWei(x).raw)).toString()) / Math.pow(2, 64)).to.be.eq(icdf)
    })
  })
})
