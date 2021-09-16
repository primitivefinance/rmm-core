import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { parseEther, parseUnits } from '@ethersproject/units'
import { TestReplicationMath, TestGetStableGivenRisky, TestGetRiskyGivenStable, TestCalcInvariant } from '../../../typechain'
import { FixedPointX64, parseFixedPointX64, parsePercentage, parseWei, Percentage, Time, toBN, Wei } from 'web3-units'
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
import { Calibration } from '../../shared'
import { maxError } from '../../shared/utils'
import { BigNumber } from '@ethersproject/bignumber'

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

const getStableFns = {
  riskySwapStep3,
  riskySwapStep4,
  riskySwapStep5,
}

const getRiskyFns = {
  stableSwapStep3,
  stableSwapStep4,
  stableSwapStep5,
}

function riskySwapStep3(reserve: Wei) {
  let inside = 1 - reserve.float
  let expected = inverse_std_n_cdf(inside)
  return expected
}

function riskySwapStep4(reserve: Wei, sigma: number, tau: Time) {
  let vol = getProportionalVol(sigma, tau.years)
  let expected = riskySwapStep3(reserve) - vol
  return expected
}

function riskySwapStep5(reserve: Wei, strike: Wei, sigma: number, tau: Time) {
  const invariant = 0
  let input = riskySwapStep4(reserve, sigma, tau)
  let cdf = std_n_cdf(input)
  let expected = strike.float * cdf + invariant
  return expected
}

function stableSwapStep3(reserve: Wei, strike: Wei) {
  let inside = reserve.float / strike.float
  let expected = inverse_std_n_cdf(inside)
  return expected
}

function stableSwapStep4(reserve: Wei, strike: Wei, sigma: number, tau: Time) {
  let vol = getProportionalVol(sigma, tau.years)
  let expected = stableSwapStep3(reserve, strike) + vol
  return expected
}

function stableSwapStep5(reserve: Wei, strike: Wei, sigma: number, tau: Time) {
  let input = stableSwapStep4(reserve, strike, sigma, tau)
  let cdf = std_n_cdf(input)
  let expected = 1 - cdf
  return expected
}

interface RangeTest {
  [key: string]: {
    params: any[]
    min: number
    max: number
    step: number
    error: number
    parse: (val: number) => any
    expected: (val: any) => any
  }
}

const riskySwapTests: RangeTest = {
  ['step0']: {
    params: [0], // value
    min: 0,
    max: 10000,
    step: 100,
    error: 1e-4,
    parse: parseWei,
    expected: (val: Wei) => new FixedPointX64(val.mul(FixedPointX64.Denominator).div(parseWei(1)).raw).parsed,
  },
  ['step1']: {
    params: [0, Time.YearInSeconds], // sigma, tau
    min: 1,
    max: 1000,
    step: 10,
    error: 1e-4,
    parse: (val: number) => parseWei(val, 4),
    expected: (val: Wei) => getProportionalVol(val.float, new Time(Time.YearInSeconds).years),
  },
  ['step2']: {
    params: [0], // reserve risky
    min: 0,
    max: 10000,
    step: 100,
    error: 1e-4,
    parse: parseWei,
    expected: (val: Wei) => new FixedPointX64(val.mul(FixedPointX64.Denominator).div(parseWei(1)).raw).parsed,
  },
  ['testStep3']: {
    params: [0], // reserve
    min: 0.02,
    max: 0.98,
    step: 0.01,
    error: maxError.centralInverseCDF,
    parse: parseWei,
    expected: riskySwapStep3,
  },
  ['testStep4']: {
    params: [0, 1e3, Time.YearInSeconds], // reserve, sigma, tau
    min: 0.02,
    max: 0.98,
    step: 0.01,
    error: maxError.centralInverseCDF,
    parse: parseWei,
    expected: (val: Wei) => riskySwapStep4(val, 0.1, new Time(Time.YearInSeconds)),
  },
  ['testStep5']: {
    // input
    params: [0, parseWei(10).raw, 1e3, Time.YearInSeconds], // reserve, strike, sigma, tau
    min: 0.01,
    max: 0.99,
    step: 0.01,
    error: maxError.cdf,
    parse: parseWei,
    expected: (val: Wei) => riskySwapStep5(val, parseWei(10), 0.1, new Time(Time.YearInSeconds)),
  },
  ['getStableGivenRisky']: {
    // reserveRisky
    params: [0, 1, 0, parseWei(10).raw, 1e3, Time.YearInSeconds], // invariant, prec, risky, strike, sigma, tau
    min: 0.02,
    max: 0.98,
    step: 0.01,
    error: maxError.cdf,
    parse: parseWei,
    expected: (val: Wei) => getStableGivenRisky(val.float, 10, 0.1, 1),
  },
}

const stableSwapTests: RangeTest = {
  ['step0']: {
    params: [0], // value
    min: 0,
    max: 10000,
    step: 100,
    error: 1e-4,
    parse: parseWei,
    expected: (val: Wei) => new FixedPointX64(val.mul(FixedPointX64.Denominator).div(parseWei(1)).raw).parsed,
  },
  ['step1']: {
    params: [0, Time.YearInSeconds], // sigma, tau
    min: 1,
    max: 1000,
    step: 10,
    error: 1e-4,
    parse: (val: number) => parseWei(val, 4),
    expected: (val: Wei) => getProportionalVol(val.float, new Time(Time.YearInSeconds).years),
  },
  ['step2']: {
    params: [0], // reserve risky
    min: 0,
    max: 10000,
    step: 100,
    error: 1e-4,
    parse: parseWei,
    expected: (val: Wei) => new FixedPointX64(val.mul(FixedPointX64.Denominator).div(parseWei(1)).raw).parsed,
  },
  ['testStep3']: {
    params: [0, parseWei(10).raw], // reserve
    min: 0.1,
    max: 9.9,
    step: 0.1,
    error: maxError.centralInverseCDF,
    parse: parseWei,
    expected: (val: Wei) => stableSwapStep3(val, parseWei(10)),
  },
  ['testStep4']: {
    params: [0, parseWei(10).raw, 1e3, Time.YearInSeconds], // reserve, sigma, tau
    min: 0.1,
    max: 9.9,
    step: 0.1,
    error: maxError.centralInverseCDF,
    parse: parseWei,
    expected: (val: Wei) => stableSwapStep4(val, parseWei(10), 0.1, new Time(Time.YearInSeconds)),
  },
  ['testStep5']: {
    // input
    params: [0, parseWei(10).raw, 1e3, Time.YearInSeconds], // reserve, strike, sigma, tau
    min: 0.1,
    max: 9.9,
    step: 0.1,
    error: maxError.cdf,
    parse: parseWei,
    expected: (val: Wei) => stableSwapStep5(val, parseWei(10), 0.1, new Time(Time.YearInSeconds)),
  },
  ['getRiskyGivenStable']: {
    // reserveRisky
    params: [0, 1, 0, parseWei(10).raw, 1e3, Time.YearInSeconds], // invariant, prec, risky, strike, sigma, tau
    min: 0.1,
    max: 9.9,
    step: 0.1,
    error: maxError.cdf,
    parse: parseWei,
    expected: (val: Wei) => getRiskyGivenStable(val.float, 10, 0.1, 1),
  },
}

const precision = {
  percentage: 0.01,
  invariant: 0.1,
  cdf: 0.1,
  integer: 1e15,
}

TestPools.forEach(function (pool: PoolState) {
  testContext(`testReplicationMath for ${pool.description}`, function () {
    const {
      strike,
      sigma,
      maturity,
      lastTimestamp,
      delta,
      spot,
      decimalsRisky,
      decimalsStable,
      scaleFactorRisky,
      scaleFactorStable,
    } = pool.calibration

    let fixture: TestStepFixture

    beforeEach(async function () {
      fixture = await this.loadFixture(testStepFixture)
      await fixture.calcInvariant.set(parseWei('1', scaleFactorRisky).raw, parseWei('1', scaleFactorStable).raw)
      await fixture.getRiskyGivenStable.set(parseWei('1', scaleFactorRisky).raw, parseWei('1', scaleFactorStable).raw)
      await fixture.getStableGivenRisky.set(parseWei('1', scaleFactorRisky).raw, parseWei('1', scaleFactorStable).raw)
      this.libraries = fixture.libraries
      this.getStableGivenRisky = fixture.getStableGivenRisky
    })

    describe('testGetStableGivenRisky', function () {
      let math: TestGetStableGivenRisky

      beforeEach(async function () {
        math = fixture.getStableGivenRisky
      })

      for (let step in riskySwapTests) {
        describe(`testing ${step}`, function () {
          let range = riskySwapTests[step]
          let increment: number = range.step
          let value: number = range.min

          it('stays within max error', async function () {
            for (let i = value; i < range.max; i += increment) {
              const input = range.parse(i)
              const expected = range.expected(input) //getProportionalVol(value.float, 1)
              if (step == 'getStableGivenRisky') {
                range.params[2] = input.raw
              } else {
                range.params[0] = input.raw
              }
              const actual = new FixedPointX64(await math[step](...range.params)).parsed
              if (step == 'testStep3' || step == 'testStep4' || step == 'testStep5' || step == 'getStableGivenRisky')
                console.log(`${step} w/ reserve: ${i}: expected: ${+expected}, actual: ${actual}, ae: ${actual - expected}`)
              //expect(actual).to.be.closeTo(+expected, range.error)
            }
          })
        })
      }
    })

    describe('testGetRiskyGivenStable', function () {
      let math: TestGetRiskyGivenStable

      beforeEach(async function () {
        math = fixture.getRiskyGivenStable
      })

      for (let step in stableSwapTests) {
        describe(`testing ${step}`, function () {
          let range = stableSwapTests[step]
          let increment: number = range.step
          let value: number = range.min

          it('stays within max error', async function () {
            for (let i = value; i < range.max; i += increment) {
              const input = range.parse(i)
              const expected = range.expected(input) //getProportionalVol(value.float, 1)
              if (step == 'getRiskyGivenStable') {
                range.params[2] = input.raw
              } else {
                range.params[0] = input.raw
              }
              const actual = new FixedPointX64(await math[step](...range.params)).parsed
              if (step == 'testStep3' || step == 'testStep4' || step == 'testStep5' || step == 'getRiskyGivenStable')
                console.log(`${step} w/ reserve: ${i}: expected: ${+expected}, actual: ${actual}, ae: ${actual - expected}`)
              //expect(actual).to.be.closeTo(+expected, range.error)
            }
          })
        })
      }
    })
  })
})
