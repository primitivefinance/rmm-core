import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestReplicationMath } from '../../../typechain'
import { Integer64x64, parseWei, Time } from '../../shared/sdk/Units'
import {
  getProportionalVol,
  getTradingFunction,
  getInverseTradingFunction,
  calcInvariant,
} from '../../shared/sdk/ReplicationMath'
import loadContext, { config } from '../context'

const { strike, sigma, maturity } = config

describe('testReplicationMath', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testReplicationMath'], async () => {})
  })

  describe('replicationMath', function () {
    let math: TestReplicationMath
    let [reserveRisky, reserveStable, liquidity] = [parseWei('0.5'), parseWei('500'), parseWei('1')]
    let calibration: any
    beforeEach(async function () {
      calibration = {
        strike: strike.raw,
        sigma: sigma.raw,
        maturity: maturity,
        lastTimestamp: new Time(+Date.now() / 1000),
      }
      math = this.contracts.testReplicationMath
    })

    it('getProportionalVolatility', async function () {
      let expected: number = new Integer64x64(await math.getProportionalVolatility(sigma.raw, maturity.raw)).normalized
      let actual: number = getProportionalVol(sigma.raw, maturity.raw)
      expect(actual).to.be.eq(expected)
    })
    it('getTradingFunction', async function () {
      let expected: number = new Integer64x64(
        await math.getTradingFunction(reserveRisky.raw, liquidity.raw, strike.raw, sigma.raw, maturity.raw)
      ).parsed
      let actual: number = getTradingFunction(reserveRisky, liquidity, calibration)
      expect(actual).to.be.eq(expected)
    })
    it('getInverseTradingFunction', async function () {
      let expected: number = new Integer64x64(
        await math.getInverseTradingFunction(reserveStable.raw, liquidity.raw, strike.raw, sigma.raw, maturity.raw)
      ).parsed
      let actual: number = getInverseTradingFunction(reserveStable, liquidity, calibration)
      expect(actual).to.be.eq(expected)
    })

    it('calcInvariant', async function () {
      let expected: number = new Integer64x64(
        await math.calcInvariant(reserveRisky.raw, reserveStable.raw, liquidity.raw, strike.raw, sigma.raw, maturity.raw)
      ).parsed
      let actual: number = calcInvariant(reserveRisky, reserveStable, liquidity, calibration)
      expect(actual).to.be.eq(expected)
    })
  })
})
