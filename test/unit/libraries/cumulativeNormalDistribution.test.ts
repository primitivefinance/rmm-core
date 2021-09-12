import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { TestCumulativeNormalDistribution } from '../../../typechain'
import { parseWei, FixedPointX64, Wei, parseFixedPointX64 } from 'web3-units'
import { std_n_cdf, inverse_std_n_cdf } from '@primitivefinance/v2-math'
import { libraryFixture } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

const precision = {
  percentage: 1e-2,
  invariant: 0.1,
  cdf: 0.1,
  integer: 1e15,
}

testContext('testCumulativeNormalDistribution', function () {
  beforeEach(async function () {
    const fixture = await this.loadFixture(libraryFixture)
    this.libraries = fixture.libraries
  })

  describe('cumulative library', function () {
    let cumulative: TestCumulativeNormalDistribution

    beforeEach(async function () {
      cumulative = this.libraries.testCumulativeNormalDistribution
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
      await expect(cumulative.cdfX64(parseFixedPointX64(Math.floor(x * 1e9), 9).raw)).to.not.be.reverted // flips sign in fn
      await expect(cumulative.cdfX64(parseFixedPointX64(Math.floor(y * 1e9), 9).raw)).to.not.be.reverted // flips sign in fn
      expect(new FixedPointX64(await cumulative.cdf(x)).parsed).to.be.closeTo(cdf, precision.percentage)
    })

    it('icdf: positive value', async function () {
      let x = 0.25
      let icdf = inverse_std_n_cdf(x)
      expect(new FixedPointX64(await cumulative.icdf(parseWei(x).raw)).parsed).to.be.closeTo(icdf, precision.percentage)
    })

    it('icdfX64: negative value', async function () {
      let x = 0.25
      await expect(cumulative.icdfX64(parseFixedPointX64(Math.floor(x * 1e4), 4).raw)).to.be.reverted // flips sign in fn
    })

    // todo: fix
    /* it('icdf: high tail', async function () {
      let x = 0.99
      let icdf = inverse_std_n_cdf(x)
      expect(new FixedPointX64(await cumulative.inverseCDFHighTail()).parsed).to.be.closeTo(icdf, precision.percentage)
    })

    it('icdf: low tail', async function () {
      let x = 0.01
      let icdf = inverse_std_n_cdf(x)
      expect(new FixedPointX64(await cumulative.inverseCDFLowTail()).parsed).to.be.closeTo(icdf, precision.percentage)
    }) */
  })
})
