import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestBlackScholes } from '../../../typechain'
import { parseWei, PERCENTAGE, Wei, YEAR, MANTISSA, Integer64x64, Percentage, Time } from '../../shared/sdk/Units'
import { Calibration } from '../../shared/sdk/Structs'
import loadContext, { config } from '../context'
import { callDelta, calculateD1, moneyness } from '../../shared/sdk/BlackScholes'

const { strike, sigma, maturity, spot } = config

describe('testBlackScholes', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testBlackScholes'], async () => {})
  })

  describe('blackScholes', function () {
    let blackScholes: TestBlackScholes, calibration: any

    beforeEach(async function () {
      blackScholes = this.contracts.testBlackScholes
      calibration = {
        strike: strike.raw,
        sigma: sigma.raw,
        maturity: maturity.raw,
        lastTimestamp: new Time(+Date.now()).seconds,
      }
    })

    it('callDelta', async function () {
      let delta = callDelta(calibration, spot)
      expect(new Integer64x64(await blackScholes.callDelta(calibration, spot.raw)).parsed).to.be.eq(delta)
    })
    it('putDelta', async function () {})
    it('d1', async function () {
      let d1 = Math.floor(calculateD1(calibration, spot) * MANTISSA) / MANTISSA
      expect(new Integer64x64(await blackScholes.d1(calibration, spot.raw)).parsed).to.be.eq(d1)
    })
    it('moneyness', async function () {
      let simple = Math.floor(moneyness(calibration, spot) * MANTISSA) / MANTISSA
      expect(new Integer64x64(await blackScholes.moneyness(calibration, spot.raw)).parsed).to.be.eq(simple)
    })
  })
})
