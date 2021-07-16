import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestCumulativeNormalDistribution } from '../../../typechain'
import { parseWei, Integer64x64, Wei } from 'web3-units'
import { std_n_cdf, inverse_std_n_cdf } from '../../shared/CumulativeNormalDistribution'
import loadContext from '../context'

describe('testCumulativeNormalDistribution', function () {
  before(async function () {
    loadContext(waffle.provider, ['testCumulativeNormalDistribution'], async () => {})
  })

  describe('cumulative', function () {
    let cumulative: TestCumulativeNormalDistribution

    beforeEach(async function () {
      cumulative = this.contracts.testCumulativeNormalDistribution
    })

    it('cdf', async function () {
      let x = 1
      let cdf = Math.floor(std_n_cdf(x) * Wei.Mantissa) / Wei.Mantissa
      expect(new Integer64x64(await cumulative.cdf(x)).float).to.be.eq(cdf)
    })
    it('icdf', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      expect(new Integer64x64(await cumulative.icdf(parseWei(x).raw)).float).to.be.eq(icdf)
    })
  })
})
