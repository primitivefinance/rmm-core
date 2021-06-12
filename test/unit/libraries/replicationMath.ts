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
    let [strike, sigma, time, RX1, RY2, liquidity] = [
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
      expect(fromMantissa(fromInt(await math.getTradingFunction(RX1.raw, liquidity.raw, strike, sigma, time)))).to.be.eq(
        getTradingFunction(RX1, liquidity, { strike, sigma, time })
      )
    })
    it('getInverseTradingFunction', async function () {
      expect(
        fromMantissa(fromInt(await math.getInverseTradingFunction(RY2.raw, liquidity.raw, strike, sigma, time)))
      ).to.be.eq(getInverseTradingFunction(RY2, liquidity, { strike, sigma, time }))
    })

    it('calcInvariant', async function () {
      expect(fromMantissa(fromInt(await math.calcInvariant(RX1.raw, RY2.raw, liquidity.raw, strike, sigma, time)))).to.be.eq(
        calculateInvariant({
          reserve: { RX1, RY2, liquidity, float: new Wei('0'), debt: new Wei('0') },
          calibration: { strike, sigma, time },
        })
      )
    })
  })
})
