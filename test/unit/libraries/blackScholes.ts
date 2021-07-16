import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestBlackScholes } from '../../../typechain'
import { Integer64x64, Wei } from 'web3-units'
import loadContext, { DEFAULT_CONFIG as config } from '../context'
import { callDelta, calculateD1, moneyness } from '../../shared/BlackScholes'

const { strike, sigma, maturity, lastTimestamp, spot } = config

describe('testBlackScholes', function () {
  before(async function () {
    loadContext(waffle.provider, ['testBlackScholes'], async () => {})
  })

  describe('blackScholes', function () {
    let blackScholes: TestBlackScholes, params: any, tau: any

    beforeEach(async function () {
      blackScholes = this.contracts.testBlackScholes
      params = {
        strike: strike.raw,
        sigma: sigma.raw,
        maturity: maturity.raw,
        lastTimestamp: lastTimestamp.raw,
      }
      tau = maturity.years - lastTimestamp.years
    })

    it('callDelta', async function () {
      const expected = callDelta(strike.float, sigma.float, tau, spot.float)
      const actual = new Integer64x64(await blackScholes.callDelta(params, spot.raw)).parsed
      expect(actual).to.be.eq(expected)
    })
    it('d1', async function () {
      let d1 = Math.floor(calculateD1(strike.float, sigma.float, tau, spot.float) * Wei.Mantissa) / Wei.Mantissa
      expect(new Integer64x64(await blackScholes.d1(params, spot.raw)).parsed).to.be.eq(d1)
    })
    it('moneyness', async function () {
      let simple = Math.floor(moneyness(strike.float, spot.float) * Wei.Mantissa) / Wei.Mantissa
      expect(new Integer64x64(await blackScholes.moneyness(params, spot.raw)).parsed).to.be.eq(simple)
    })
  })
})
