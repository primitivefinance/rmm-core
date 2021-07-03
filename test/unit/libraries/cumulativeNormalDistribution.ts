import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestCumulativeNormalDistribution } from '../../../typechain'
import { parseWei, MANTISSA, Integer64x64 } from '../../shared/sdk/Units'
import { std_n_cdf, inverse_std_n_cdf } from '../../shared/sdk/CumulativeNormalDistribution'
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
      expect(new Integer64x64(await cumulative.cdf(x)).parsed).to.be.eq(cdf)
    })
    it('icdf', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      expect(new Integer64x64(await cumulative.icdf(parseWei(x).raw)).parsed).to.be.eq(icdf)
    })
  })
})
