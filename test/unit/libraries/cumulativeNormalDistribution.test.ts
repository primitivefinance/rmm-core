import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { TestCumulativeNormalDistribution } from '../../../typechain'
import { parseWei, FixedPointX64, Wei, parseFixedPointX64 } from 'web3-units'
import { std_n_cdf, inverse_std_n_cdf } from '@primitivefinance/v2-math'
import { libraryFixture } from '../../shared/fixtures'

const precision = {
  percentage: 0.01,
  invariant: 0.1,
  cdf: 0.1,
  integer: 1e15,
}

describe('testCumulativeNormalDistribution', function () {
  beforeEach(async function () {
    const fixture = await this.loadFixture(libraryFixture)
    this.contracts = fixture.contracts
  })

  describe('cumulative', function () {
    let cumulative: TestCumulativeNormalDistribution

    beforeEach(async function () {
      cumulative = this.contracts.testCumulativeNormalDistribution
    })

    it('cdf: positive values', async function () {
      let x = 1
      let y = 0.5
      let cdf = Math.floor(std_n_cdf(x) * Wei.Mantissa) / Wei.Mantissa
      await expect(cumulative.cdf(parseWei(x).div(1e10).raw)).to.not.be.reverted
      await expect(cumulative.cdf(parseWei(y).div(1e10).raw)).to.not.be.reverted
      expect(new FixedPointX64(await cumulative.cdf(x)).parsed).to.be.closeTo(cdf, precision.percentage)
    })

    it('cdf: negative values', async function () {
      let x = 1
      let y = 0.5
      let cdf = Math.floor(std_n_cdf(x) * Wei.Mantissa) / Wei.Mantissa
      await expect(cumulative.cdfX64(parseFixedPointX64(x).raw)).to.not.be.reverted // flips sign in fn
      await expect(cumulative.cdfX64(parseFixedPointX64(y).raw)).to.not.be.reverted // flips sign in fn
      expect(new FixedPointX64(await cumulative.cdf(x)).parsed).to.be.closeTo(cdf, precision.percentage)
    })

    it('icdf: positive value', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      expect(new FixedPointX64(await cumulative.icdf(parseWei(x).raw)).parsed).to.be.closeTo(icdf, precision.percentage)
    })

    it('icdf: negative value', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      await expect(cumulative.icdfX64(parseFixedPointX64(x).raw)).to.not.be.reverted // flips sign in fn
      expect(new FixedPointX64(await cumulative.icdf(parseWei(x).raw)).parsed).to.be.closeTo(icdf, precision.percentage)
    })
  })
})
