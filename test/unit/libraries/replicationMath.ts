import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestReplicationMath } from '../../../typechain'
import { Integer64x64, parseWei, Time } from 'web3-units'
import { getProportionalVol, getTradingFunction, getInverseTradingFunction, calcInvariant } from '../../shared/sdk'
import loadContext, { config } from '../context'

const { strike, sigma, maturity, lastTimestamp } = config

describe('testReplicationMath', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testReplicationMath'], async () => {})
  })

  describe('replicationMath', function () {
    let math: TestReplicationMath
    let [reserveRisky, reserveStable, liquidity] = [parseWei('0.5'), parseWei('500'), parseWei('1')]
    let tau: Time
    beforeEach(async function () {
      math = this.contracts.testReplicationMath
      tau = new Time(maturity.raw - lastTimestamp.raw)
    })

    it('getProportionalVolatility', async function () {
      let expected: number = new Integer64x64(await math.getProportionalVolatility(sigma.raw, tau.raw)).percentage
      let actual: number = getProportionalVol(sigma.float, tau.years)
      expect(actual).to.be.eq(expected)
    })
    it('getTradingFunction', async function () {
      let expected: number = new Integer64x64(
        await math.getTradingFunction(reserveRisky.raw, liquidity.raw, strike.raw, sigma.raw, tau.raw)
      ).parsed
      let actual: number = getTradingFunction(0, reserveRisky.float, liquidity.float, strike.float, sigma.float, tau.years)
      expect(actual).to.be.eq(expected)
    })
    it('getInverseTradingFunction', async function () {
      let expected: number = new Integer64x64(
        await math.getInverseTradingFunction(reserveStable.raw, liquidity.raw, strike.raw, sigma.raw, tau.raw)
      ).parsed
      let actual: number = getInverseTradingFunction(
        0,
        reserveStable.float,
        liquidity.float,
        strike.float,
        sigma.float,
        tau.years
      )
      expect(actual).to.be.eq(expected)
    })

    it('calcInvariant', async function () {
      let expected: number = new Integer64x64(
        await math.calcInvariant(reserveRisky.raw, reserveStable.raw, liquidity.raw, strike.raw, sigma.raw, tau.raw)
      ).parsed
      let actual: number = calcInvariant(
        reserveRisky.float,
        reserveStable.float,
        liquidity.float,
        strike.float,
        sigma.float,
        tau.years
      )
      expect(actual).to.be.eq(expected)
    })
  })
})
