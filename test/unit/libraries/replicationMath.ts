import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestReplicationMath } from '../../../typechain'
import Engine from '../../shared/sdk/Engine'
import { Integer64x64, parseWei, Percentage, PERCENTAGE, Time, Wei } from '../../shared/sdk/Units'
import { getProportionalVol, getTradingFunction, getInverseTradingFunction } from '../../shared/sdk/ReplicationMath'
import loadContext from '../context'

describe('testReplicationMath', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testReplicationMath'], async () => {})
  })

  describe('replicationMath', function () {
    let math: TestReplicationMath
    let [strike, sigma, time, reserveRisky, reserveStable, liquidity] = [
      parseWei('1000'),
      new Percentage(0.8 * PERCENTAGE),
      new Time(31449600),
      parseWei('0.5'),
      parseWei('500'),
      parseWei('1'),
    ]
    let calibration = { strike: strike, sigma: sigma, maturity: time, lastTimestamp: new Time(0) }
    beforeEach(async function () {
      math = this.contracts.testReplicationMath
    })

    it('getProportionalVolatility', async function () {
      expect(new Integer64x64(await math.getProportionalVolatility(sigma.float, maturity.raw)).parsed).to.be.eq(
        getProportionalVol(sigma.float, maturity.raw)
      )
    })
    it('getTradingFunction', async function () {
      expect(
        new Integer64x64(
          await math.getTradingFunction(reserveRisky.raw, liquidity.raw, strike.raw, sigma.float, maturity.raw)
        ).parsed
      ).to.be.eq(getTradingFunction(reserveRisky, liquidity, calibration))
    })
    it('getInverseTradingFunction', async function () {
      expect(
        new Integer64x64(
          await math.getInverseTradingFunction(reserveStable.raw, liquidity.raw, strike.raw, sigma.float, maturity.raw)
        ).parsed
      ).to.be.eq(getInverseTradingFunction(reserveStable, liquidity, calibration))
    })

    it('calcInvariant', async function () {
      expect(
        new Integer64x64(
          await math.calcInvariant(reserveRisky.raw, reserveStable.raw, liquidity.raw, strike.raw, sigma.float, maturity.raw)
        ).parsed
      ).to.be.eq(Engine.calcInvariant(reserveRisky, reserveStable, liquidity, calibration))
    })
  })
})
