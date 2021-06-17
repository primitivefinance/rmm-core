import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestReplicationMath } from '../../../typechain'
import { calculateInvariant } from '../../shared/utilities'
import { parseWei, PERCENTAGE, Wei, fromMantissa, fromInt } from '../../shared/Units'
import { getProportionalVol, getTradingFunction, getInverseTradingFunction } from '../../shared/ReplicationMath'
import loadContext from '../context'

describe('testReplicationMath', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testReplicationMath'], async () => {})
  })

  describe('replicationMath', function () {
    let math: TestReplicationMath
    let [strike, sigma, time, reserveRisky, reserveStable, liquidity] = [
      parseWei('1000').raw,
      0.8 * PERCENTAGE,
      31449600,
      parseWei('0.5'),
      parseWei('500'),
      parseWei('1'),
    ]
    beforeEach(async function () {
      math = this.contracts.testReplicationMath
    })

    it('getProportionalVolatility', async function () {
      expect(fromMantissa(fromInt(await math.getProportionalVolatility(sigma, time)))).to.be.eq(
        getProportionalVol(sigma, time)
      )
    })
    it('getTradingFunction', async function () {
      expect(
        fromMantissa(fromInt(await math.getTradingFunction(reserveRisky.raw, liquidity.raw, strike, sigma, time)))
      ).to.be.eq(getTradingFunction(reserveRisky, liquidity, { strike, sigma, time }))
    })
    it('getInverseTradingFunction', async function () {
      expect(
        fromMantissa(fromInt(await math.getInverseTradingFunction(reserveStable.raw, liquidity.raw, strike, sigma, time)))
      ).to.be.eq(getInverseTradingFunction(reserveStable, liquidity, { strike, sigma, time }))
    })

    it('calcInvariant', async function () {
      expect(
        fromMantissa(
          fromInt(await math.calcInvariant(reserveRisky.raw, reserveStable.raw, liquidity.raw, strike, sigma, time))
        )
      ).to.be.eq(
        calculateInvariant({
          reserve: { reserveRisky, reserveStable, liquidity, float: new Wei('0'), debt: new Wei('0') },
          calibration: { strike, sigma, time },
        })
      )
    })
  })
})
