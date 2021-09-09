import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { TestReplicationMath, TestGetStableGivenRisky, TestGetRiskyGivenStable, TestCalcInvariant } from '../../../typechain'
import { FixedPointX64, parseFixedPointX64, parseWei, Percentage, Time, toBN, Wei } from 'web3-units'
import { Wallet } from '@ethersproject/wallet'
import {
  getProportionalVol,
  getStableGivenRisky,
  getRiskyGivenStable,
  calcInvariant,
  inverse_std_n_cdf,
  std_n_cdf,
} from '@primitivefinance/v2-math'
import { TestPools, PoolState } from '../../shared/poolConfigs'
import { LibraryFixture, libraryFixture, deploy } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

interface TestTradingFunctionFixture {
  getStableGivenRisky: TestGetStableGivenRisky
}

async function testGetStableGivenRisky([wallet]: Wallet[], provider): Promise<TestTradingFunctionFixture> {
  return {
    getStableGivenRisky: (await deploy('TestGetStableGivenRisky', wallet)) as unknown as TestGetStableGivenRisky,
  }
}

interface TestGetRiskyGivenStableFixture {
  getRiskyGivenStable: TestGetRiskyGivenStable
}

async function testGetRiskyGivenStable([wallet]: Wallet[], provider): Promise<TestGetRiskyGivenStableFixture> {
  return {
    getRiskyGivenStable: (await deploy('TestGetRiskyGivenStable', wallet)) as unknown as TestGetRiskyGivenStable,
  }
}

interface TestCalcInvariantFixture {
  calcInvariant: TestCalcInvariant
}

async function testCalcInvariant([wallet]: Wallet[], provider): Promise<TestCalcInvariantFixture> {
  return {
    calcInvariant: (await deploy('TestCalcInvariant', wallet)) as unknown as TestCalcInvariant,
  }
}

interface TestStepFixture extends LibraryFixture {
  getRiskyGivenStable: TestGetRiskyGivenStable
  getStableGivenRisky: TestGetStableGivenRisky
  calcInvariant: TestCalcInvariant
}

async function testStepFixture([wallet]: Wallet[], provider): Promise<TestStepFixture> {
  const libraries = await libraryFixture([wallet], provider)
  const { getRiskyGivenStable } = await testGetRiskyGivenStable([wallet], provider)
  const { getStableGivenRisky } = await testGetStableGivenRisky([wallet], provider)
  const { calcInvariant } = await testCalcInvariant([wallet], provider)
  return {
    getRiskyGivenStable: getRiskyGivenStable,
    getStableGivenRisky: getStableGivenRisky,
    calcInvariant: calcInvariant,
    ...libraries,
  }
}

const precision = {
  percentage: 0.01,
  invariant: 0.1,
  cdf: 0.1,
  integer: 1e15,
}

TestPools.forEach(function (pool: PoolState) {
  testContext(`testReplicationMath for ${pool.description}`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta, spot } = pool.calibration
    let fixture: TestStepFixture
    beforeEach(async function () {
      fixture = await this.loadFixture(testStepFixture)
      let [prec0, prec1] = [pool.calibration.precisionRisky, pool.calibration.precisionStable]
      await fixture.calcInvariant.set(Math.pow(10, prec0), Math.pow(10, prec1))
      await fixture.getRiskyGivenStable.set(Math.pow(10, prec0), Math.pow(10, prec1))
      await fixture.getStableGivenRisky.set(Math.pow(10, prec0), Math.pow(10, prec1))
      this.libraries = fixture.libraries
    })

    describe('replicationMath', function () {
      let math: TestReplicationMath
      let [reserveRisky, reserveStable, liquidity] = [parseWei('0.5'), parseWei('500'), parseWei('1')]
      let tau: Time

      beforeEach(async function () {
        math = this.libraries.testReplicationMath
        await math.set(Math.pow(10, pool.calibration.precisionRisky), Math.pow(10, pool.calibration.precisionStable))
        tau = new Time(maturity.raw - lastTimestamp.raw)
      })

      it('YEAR()', async function () {
        expect(await math.YEAR()).to.be.eq(31556952)
      })

      it('getProportionalVolatility', async function () {
        let expected: number = new FixedPointX64(await math.getProportionalVolatility(sigma.raw, tau.raw)).parsed
        let actual: number = getProportionalVol(sigma.float, tau.years)
        expect(actual).to.be.closeTo(expected, precision.percentage)
      })

      describe('Trading Function: getStableGivenRisky', async function () {
        it('step0: parse strike to 64x64 fixed point int128', async function () {
          let expected = new FixedPointX64(FixedPointX64.Denominator.mul(pool.calibration.strike.float)).raw
          let step0 = await fixture.getStableGivenRisky.step0(pool.calibration.strike.raw)
          expect(step0).to.be.eq(expected)
        })

        it('step1: calculate sigma * sqrt(tau)', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          let expected = pool.calibration.sigma.float * Math.sqrt(tau.years)
          let step1 = new FixedPointX64(await fixture.getStableGivenRisky.step1(pool.calibration.sigma.raw, tau.raw))
          expect(step1.parsed).to.be.closeTo(expected, precision.percentage)
        })

        it('step2: get the stable reserves per 1 unit of liquidity', async function () {
          let expected = new FixedPointX64(FixedPointX64.Denominator.mul(reserveRisky.raw).div(parseWei(1).raw)).raw
          let step2 = await fixture.getStableGivenRisky.step2(reserveRisky.raw)
          expect(step2).to.be.eq(expected)
        })

        it('step3: calculate phi = CDF^-1( 1 - riskyReserve )', async function () {
          let reserve = reserveRisky.mul(parseWei(1)).div(liquidity)
          let inside = 1 - reserve.float
          let inversedCDF = inverse_std_n_cdf(inside)
          let expected = inversedCDF
          let step3 = new FixedPointX64(await fixture.getStableGivenRisky.step3(reserve.raw))
          expect(step3.float).to.be.closeTo(expected, precision.invariant)
        })

        it('step4: calculate input = phi - vol', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          let vol = pool.calibration.sigma.float * Math.sqrt(tau.years)
          let inside = 1 - reserveRisky.float / liquidity.float
          let inversedCDF = inverse_std_n_cdf(inside)
          let expected = inversedCDF - vol
          let step4 = new FixedPointX64(
            await fixture.getStableGivenRisky.step4(
              toBN(Math.floor(inversedCDF * +FixedPointX64.Denominator).toString()),
              toBN(vol).mul(FixedPointX64.Denominator)
            )
          )
          expect(step4.parsed).to.be.eq(expected)
        })

        it('step5: calculate reserveRisky = ( K*CDF(step4) + invariant ) * liquidity', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          const invariant = 0
          let vol = pool.calibration.sigma.float * Math.sqrt(tau.years)
          let phi = inverse_std_n_cdf(1 - reserveRisky.float / liquidity.float)
          let input = phi - vol
          let cdf = std_n_cdf(input)
          let step4 = await fixture.getStableGivenRisky.step4(
            await fixture.getStableGivenRisky.step3(await fixture.getStableGivenRisky.step2(reserveRisky.raw)),
            await fixture.getStableGivenRisky.step1(pool.calibration.sigma.raw, tau.raw)
          )
          let expected = (pool.calibration.strike.float * cdf + invariant) * liquidity.float
          let step5 = new FixedPointX64(
            await fixture.getStableGivenRisky.step5(
              await fixture.getStableGivenRisky.step0(pool.calibration.strike.raw),
              step4,
              invariant
            )
          )
          expect(step5.parsed).to.be.closeTo(expected, precision.invariant)
        })

        it('getStableGivenRisky', async function () {
          let expected: number = new FixedPointX64(
            await fixture.getStableGivenRisky.getStableGivenRisky(0, reserveStable.raw, strike.raw, sigma.raw, tau.raw)
          ).float
          let actual: number = getStableGivenRisky(reserveStable.float, strike.float, sigma.float, tau.years)
          expect(actual).to.be.eq(expected)
        })
      })

      describe('Inverse Trading Function: getRiskyGivenStable', async function () {
        it('step0: parse strike to 64x64 fixed point int128', async function () {
          let expected = new FixedPointX64(FixedPointX64.Denominator.mul(pool.calibration.strike.float)).raw
          let step0 = await fixture.getRiskyGivenStable.step0(pool.calibration.strike.raw)
          expect(step0).to.be.eq(expected)
        })

        it('step1: calculate sigma * sqrt(tau)', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          let expected = pool.calibration.sigma.float * Math.sqrt(tau.years)
          let step1 = new FixedPointX64(await fixture.getRiskyGivenStable.step1(pool.calibration.sigma.raw, tau.raw))
          expect(step1.parsed).to.be.closeTo(expected, precision.percentage)
        })

        it('step2: get the stable reserves per 1 unit of liquidity', async function () {
          let expected = new FixedPointX64(FixedPointX64.Denominator.mul(reserveRisky.raw).div(parseWei(1).raw)).raw
          let step2 = await fixture.getRiskyGivenStable.step2(reserveRisky.raw)
          expect(step2).to.be.eq(expected)
        })

        it('step3: calculate phi = CDF^-1( (reserve - invariant) / K )', async function () {
          let reserve = reserveRisky.mul(parseWei(1)).div(liquidity) //await fixture.getRiskyGivenStable.step2(reserveRisky.raw)
          let invariant = 0
          let inside = (reserve.float - invariant) / pool.calibration.strike.float
          let inversedCDF = inverse_std_n_cdf(inside)
          let expected = inversedCDF
          let step3 = new FixedPointX64(
            await fixture.getRiskyGivenStable.step3(reserve.raw, invariant, pool.calibration.strike.raw)
          )
          expect(step3.parsed).to.be.closeTo(expected, precision.cdf)
        })

        it('step4: calculate input = phi + vol', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          const invariant = 0
          let vol = pool.calibration.sigma.float * Math.sqrt(tau.years)
          let reserve = reserveRisky.mul(parseWei(1)).div(liquidity) //await fixture.getRiskyGivenStable.step2(reserveRisky.raw)
          let inside = (reserve.float - invariant) / pool.calibration.strike.float
          let inversedCDF = inverse_std_n_cdf(inside)
          let expected = inversedCDF + vol
          let step4 = new FixedPointX64(
            await fixture.getRiskyGivenStable.step4(
              toBN((inversedCDF * +FixedPointX64.Denominator).toString()),
              FixedPointX64.Denominator.mul(vol)
            )
          )
          expect(step4.parsed).to.be.eq(expected)
        })

        it('step5: calculate reserveRisky = ( 1 - CDF(step4) ) * liquidity', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          const invariant = 0
          let step1 = await fixture.getRiskyGivenStable.step1(pool.calibration.sigma.raw, tau.raw)
          let vol = step1
          let step3 = await fixture.getRiskyGivenStable.step3(reserveRisky.raw, invariant, pool.calibration.strike.raw)
          let step4 = await fixture.getRiskyGivenStable.step4(step3, vol)
          let cdf = std_n_cdf(new FixedPointX64(step4).parsed)
          let expected =
            new FixedPointX64(
              parseWei(1 - cdf)
                .mul(liquidity)
                .mul(FixedPointX64.Denominator)
                .div(parseWei(1)).raw
            ).parsed / Math.pow(10, 18)
          let step5 = new FixedPointX64(await fixture.getRiskyGivenStable.step5(step4))
          expect(step5.parsed).to.be.closeTo(expected, precision.cdf)
        })

        it('getRiskyGivenStable', async function () {
          let expected: number = new FixedPointX64(
            await fixture.getRiskyGivenStable.getRiskyGivenStable(
              0,
              reserveStable.raw,

              strike.raw,
              sigma.raw,
              tau.raw
            )
          ).float
          let actual: number = getRiskyGivenStable(
            reserveStable.float,
            liquidity.float,
            strike.float,
            sigma.float,
            tau.years
          )
          expect(actual).to.be.eq(expected)
        })
      })

      describe('Invariant: calcInvariant', async function () {
        it('step0', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          let expected = getStableGivenRisky(
            reserveRisky.float,

            pool.calibration.strike.float,
            pool.calibration.sigma.float,
            tau.years
          )
          let step0 = new FixedPointX64(
            await fixture.calcInvariant.step0(
              reserveRisky.raw,
              pool.calibration.strike.raw,
              pool.calibration.sigma.raw,
              tau.raw
            )
          )
          expect(step0.parsed).to.be.closeTo(expected, precision.invariant)
        })

        it('step1', async function () {
          const tau = pool.calibration.maturity.sub(pool.calibration.lastTimestamp)
          let reserve2 = getStableGivenRisky(
            reserveRisky.float,

            pool.calibration.strike.float,
            pool.calibration.sigma.float,
            tau.years
          )
          let expected = new FixedPointX64(FixedPointX64.Denominator.mul(reserveStable.sub(parseWei(reserve2)).raw))
          let step0 = await fixture.calcInvariant.step0(
            reserveRisky.raw,
            pool.calibration.strike.raw,
            pool.calibration.sigma.raw,
            pool.calibration.maturity.sub(pool.calibration.lastTimestamp).raw
          )
          let step1 = new FixedPointX64(await fixture.calcInvariant.step1(reserveStable.raw, step0))
          expect(step1.parsed).to.be.closeTo(expected.parsed / Math.pow(10, 18), precision.invariant)
        })

        it('calcInvariant', async function () {
          let expected: number = new FixedPointX64(
            await math.calcInvariant(reserveRisky.raw, reserveStable.raw, strike.raw, sigma.raw, tau.raw)
          ).parsed
          let actual: number = calcInvariant(reserveRisky.float, reserveStable.float, strike.float, sigma.float, tau.years)
          expect(actual).to.be.closeTo(expected, precision.invariant)
        })
      })
    })
  })
})
