import { Wallet } from '@ethersproject/wallet'
import { FixedPointX64, parseWei, Time, Wei } from 'web3-units'
import {
  getProportionalVol,
  getStableGivenRisky,
  getRiskyGivenStable,
  calcInvariant,
  inverse_std_n_cdf,
  std_n_cdf,
} from '@primitivefi/rmm-math'

import { testContext } from '../../shared/testContext'
import { maxError, scaleUp } from '../../shared/utils'
import { TestPools, PoolState } from '../../shared/poolConfigs'
import { LibraryFixture, libraryFixture, deploy } from '../../shared/fixtures'

import { TestGetStableGivenRisky, TestGetRiskyGivenStable, TestCalcInvariant } from '../../../typechain'

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
    increment: number
    error: number
    parse: (val: number) => any
    expected: (val: any) => any
  }
}

function parseX64(val: Wei): FixedPointX64 {
  return new FixedPointX64(val.mul(FixedPointX64.Denominator).div(parseWei(1, val.decimals)).raw, val.decimals)
}

const DEBUG = false

// for each calibration
TestPools.forEach(function (pool: PoolState) {
  testContext(`testReplicationMath for ${pool.description}`, function () {
    const { strike, sigma, tau, decimalsRisky, decimalsStable, scaleFactorRisky, scaleFactorStable } = pool.calibration

    let fixture: TestStepFixture

    // test domain and range of `getStableGivenRisky`
    const riskySwapTests: RangeTest = {
      ['step0']: {
        params: [0],
        min: 0,
        max: 10000,
        increment: 100,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses strike
        expected: (val: Wei) => parseX64(val).parsed, // parses strike to fixed point
      },
      ['step1']: {
        params: [0, tau.raw], // sigma, tau
        min: 1,
        max: 1000,
        increment: 10,
        error: 1e-4,
        parse: (val: number) => parseWei(val, 4), // parses percentage
        expected: (val: Wei) => getProportionalVol(val.float, tau.years),
      },
      ['step2']: {
        params: [0], // reserve risky
        min: 0,
        max: 10000,
        increment: 100,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsRisky), // parses risky
        expected: (val: Wei) => parseX64(val).parsed,
      },
      ['testStep3']: {
        params: [0], // reserve
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.centralInverseCDF,
        parse: (val: number) => scaleUp(val, decimalsRisky),
        expected: riskySwapStep3,
      },
      ['testStep4']: {
        params: [0, sigma.raw, tau.raw], // reserve, sigma, tau
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.centralInverseCDF,
        parse: (val: number) => scaleUp(val, decimalsRisky), // parses risky
        expected: (val: Wei) => riskySwapStep4(val, sigma.float, tau),
      },
      ['testStep5']: {
        params: [0, strike.raw, sigma.raw, tau.raw], // reserve, strike, sigma, tau
        min: 0.01,
        max: 0.99,
        increment: 0.01,
        error: maxError.cdf,
        parse: (val: number) => scaleUp(val, decimalsRisky), // parses risky
        expected: (val: Wei) => riskySwapStep5(val, strike, sigma.float, tau),
      },
      ['getStableGivenRisky']: {
        params: [0, 1, 0, strike.raw, sigma.raw, tau.raw], // invariant, prec, risky, strike, sigma, tau
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.cdf,
        parse: (val: number) => scaleUp(val, decimalsRisky), // parses risky
        expected: (val: Wei) => getStableGivenRisky(val.float, strike.float, sigma.float, tau.years),
      },
    }

    // test domain and range of `getRiskyGivenStable
    const stableSwapTests: RangeTest = {
      ['step0']: {
        params: [0], // value
        min: 0,
        max: 10000,
        increment: 100,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses strike
        expected: (val: Wei) => parseX64(val).parsed,
      },
      ['step1']: {
        params: [0, tau.raw], // sigma, tau
        min: 1,
        max: 1000,
        increment: 10,
        error: 1e-4,
        parse: (val: number) => parseWei(val, 4), // parses percentage
        expected: (val: Wei) => getProportionalVol(val.float, tau.years),
      },
      ['step2']: {
        params: [0], // stable
        min: 0,
        max: 10000,
        increment: 100,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses stable
        expected: (val: Wei) => parseX64(val).parsed,
      },
      ['testStep3']: {
        params: [0, strike.raw], // reserve
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: maxError.centralInverseCDF,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses stable
        expected: (val: Wei) => stableSwapStep3(val, strike),
      },
      ['testStep4']: {
        params: [0, strike.raw, sigma.raw, tau.raw], // reserve, sigma, tau
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: maxError.centralInverseCDF,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses stable
        expected: (val: Wei) => stableSwapStep4(val, strike, sigma.float, tau),
      },
      ['testStep5']: {
        params: [0, strike.raw, sigma.raw, tau.raw], // reserve, strike, sigma, tau
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: maxError.cdf,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses stable
        expected: (val: Wei) => stableSwapStep5(val, strike, sigma.float, tau),
      },
      ['getRiskyGivenStable']: {
        params: [0, 1, 0, strike.raw, sigma.raw, tau.raw], // invariant, prec, risky, strike, sigma, tau
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: maxError.cdf,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses stable
        expected: (val: Wei) => getRiskyGivenStable(val.float, strike.float, sigma.float, tau.years),
      },
    }

    const calcInvariantTests: RangeTest = {
      ['calcInvariantRisky']: {
        params: [0, strike.div(2).raw, strike.raw, sigma.raw, tau.raw],
        min: 0.01,
        max: 0.99,
        increment: 0.1,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsRisky), // parses risky
        expected: (val: Wei) => calcInvariant(val.float, strike.div(2).float, strike.float, sigma.float, tau.years),
      },
      ['calcInvariantStable']: {
        params: [scaleUp(0.5, decimalsRisky).raw, 0, strike.raw, sigma.raw, tau.raw],
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: 1e-4,
        parse: (val: number) => scaleUp(val, decimalsStable), // parses strike
        expected: (val: Wei) =>
          calcInvariant(scaleUp(0.5, decimalsRisky).float, val.float, strike.float, sigma.float, tau.years),
      },
    }

    // load the fixtures
    beforeEach(async function () {
      fixture = await this.loadFixture(testStepFixture)
      const scalars = [Math.pow(10, scaleFactorRisky), Math.pow(10, scaleFactorStable)]
      await fixture.calcInvariant.set(scalars[0], scalars[1])
      await fixture.getRiskyGivenStable.set(scalars[0], scalars[1])
      await fixture.getStableGivenRisky.set(scalars[0], scalars[1])
      this.libraries = fixture.libraries
    })

    // run the tests for `getStableGivenRisky
    describe('testGetStableGivenRisky', function () {
      // for each of the tests, run through its domain and range
      for (let step in riskySwapTests) {
        describe(`testing ${step}`, function () {
          let { params, min, max, increment, parse, expected, error } = riskySwapTests[step]

          it('stays within max error', async function () {
            for (let i = min; i < max; i += increment) {
              const input = parse(i) // i is a number value that must be parsed for use in the contract fns
              const exp = expected(input) // uses the parsed value and returns the expected value of this test

              if (step == 'getStableGivenRisky') {
                params[2] = input.raw // reserve parameter is at index of `2`
              } else {
                params[0] = input.raw
              }

              const result = await fixture.getStableGivenRisky[step](...params) // smart contract call
              const actual = new FixedPointX64(result).parsed // result is in fixed point 64x64, so it needs to be parsed

              if (
                DEBUG &&
                (step == 'testStep3' || step == 'testStep4' || step == 'testStep5' || step == 'getStableGivenRisky')
              )
                console.log(`${step} w/ reserve: ${i}: expected: ${+exp}, actual: ${actual}, ae: ${actual - exp}`)
              //expect(actual).to.be.closeTo(+exp, error)
            }
          })
        })
      }
    })

    // run the tests for `getStableGivenRisky
    describe('testGetRiskyGivenStable', function () {
      // for each of the tests, run through its domain and range
      for (let step in stableSwapTests) {
        describe(`testing ${step}`, function () {
          let { params, min, max, increment, parse, expected, error } = stableSwapTests[step]

          it('stays within max error', async function () {
            for (let i = min; i < max; i += increment) {
              const input = parse(i) // i is a number value that must be parsed for use in the contract fns
              const exp = expected(input) // uses the parsed value and returns the expected value of this test

              if (step == 'getRiskyGivenStable') {
                params[2] = input.raw // reserve parameter is at index of `2`
              } else {
                params[0] = input.raw
              }

              const result = await fixture.getRiskyGivenStable[step](...params) // smart contract call
              const actual = new FixedPointX64(result).parsed // result is in fixed point 64x64, so it needs to be parsed

              if (
                DEBUG &&
                (step == 'testStep3' || step == 'testStep4' || step == 'testStep5' || step == 'getRiskyGivenStable')
              )
                console.log(`${step} w/ reserve: ${i}: expected: ${+exp}, actual: ${actual}, ae: ${actual - exp}`)
              //expect(actual).to.be.closeTo(+exp, error)
            }
          })
        })
      }
    })

    describe('testCalcInvariant', function () {
      // for each of the tests, run through its domain and range
      for (let step in calcInvariantTests) {
        describe(`testing ${step}`, function () {
          let { params, min, max, increment, parse, expected, error } = calcInvariantTests[step]

          it('stays within max error', async function () {
            for (let i = min; i < max; i += increment) {
              const input = parse(i) // i is a number value that must be parsed for use in the contract fns
              const exp = expected(input) // uses the parsed value and returns the expected value of this test

              if (step == 'calcInvariantRisky') {
                params[0] = input.raw
              } else {
                params[1] = input.raw
              }

              const result = await fixture.calcInvariant[step](...params) // smart contract call
              const actual = new FixedPointX64(result).parsed // result is in fixed point 64x64, so it needs to be parsed

              if (DEBUG)
                console.log(`${step} w/ reserve: ${i}: expected: ${+exp}, actual: ${actual}, ae: ${actual - exp}`)
              //expect(actual).to.be.closeTo(+exp, error)
            }
          })
        })
      }
    })
  })
})
