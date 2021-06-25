import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestBlackScholes } from '../../../typechain'
import { parseWei, PERCENTAGE, Wei, fromMantissa, fromInt, YEAR, MANTISSA } from '../../shared/sdk/Units'
import loadContext from '../context'
import { Calibration } from '../../shared/utilities'
import { calculateDelta, calculateD1, moneyness } from '../../shared/sdk/BlackScholes'

describe('testBlackScholes', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testBlackScholes'], async () => {})
  })

  describe('blackScholes', function () {
    let blackScholes: TestBlackScholes, calibration: Calibration, spot: Wei

    beforeEach(async function () {
      blackScholes = this.contracts.testBlackScholes
      calibration = { strike: parseWei('1000').raw, sigma: 0.85 * PERCENTAGE, time: YEAR }
      spot = parseWei('1050')
    })

    it('callDelta', async function () {
      let delta = Math.floor(calculateDelta(calibration, spot) * MANTISSA) / MANTISSA
      expect(fromMantissa(fromInt(await blackScholes.callDelta(calibration, spot.raw)))).to.be.eq(delta)
    })
    it('putDelta', async function () {})
    it('d1', async function () {
      let d1 = Math.floor(calculateD1(calibration, spot) * MANTISSA) / MANTISSA
      expect(fromMantissa(fromInt(await blackScholes.d1(calibration, spot.raw)))).to.be.eq(d1)
    })
    it('moneyness', async function () {
      let simple = Math.floor(moneyness(calibration, spot) * MANTISSA) / MANTISSA
      expect(fromMantissa(fromInt(await blackScholes.moneyness(calibration, spot.raw)))).to.be.eq(simple)
    })
  })
})
