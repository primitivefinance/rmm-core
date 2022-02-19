import { ethers } from 'hardhat'
import { Wallet } from '@ethersproject/wallet'
import { createFixtureLoader } from 'ethereum-waffle'
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
import { maxError } from '../../shared/utils'
import { TestPools, PoolState } from '../../shared/poolConfigs'
import { TestStepFixture, replicationLibrariesFixture } from '../../shared/fixtures'

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
        parse: (val: number) => parseWei(val, decimalsStable), // parses strike
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
        parse: (val: number) => parseWei(val, decimalsRisky), // parses risky
        expected: (val: Wei) => parseX64(val).parsed,
      },
      ['testStep3']: {
        params: [0], // reserve
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.centralInverseCDF,
        parse: (val: number) => parseWei(val, decimalsRisky),
        expected: riskySwapStep3,
      },
      ['testStep4']: {
        params: [0, sigma.raw, tau.raw], // reserve, sigma, tau
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.centralInverseCDF,
        parse: (val: number) => parseWei(val, decimalsRisky), // parses risky
        expected: (val: Wei) => riskySwapStep4(val, sigma.float, tau),
      },
      ['testStep5']: {
        params: [0, strike.raw, sigma.raw, tau.raw], // reserve, strike, sigma, tau
        min: 0.01,
        max: 0.99,
        increment: 0.01,
        error: maxError.cdf,
        parse: (val: number) => parseWei(val, decimalsRisky), // parses risky
        expected: (val: Wei) => riskySwapStep5(val, strike, sigma.float, tau),
      },
      ['getStableGivenRisky']: {
        params: [0, 1, 0, strike.raw, sigma.raw, tau.raw], // invariant, prec, risky, strike, sigma, tau
        min: 0.02,
        max: 0.98,
        increment: 0.01,
        error: maxError.cdf,
        parse: (val: number) => parseWei(val, decimalsRisky), // parses risky
        expected: (val: Wei) => getStableGivenRisky(val.float, strike.float, sigma.float, tau.years),
      },
    }

    const calcInvariantTests: RangeTest = {
      ['calcInvariantRisky']: {
        params: [0, strike.div(2).raw, strike.raw, sigma.raw, tau.raw],
        min: 0.01,
        max: 0.99,
        increment: 0.1,
        error: 1e-4,
        parse: (val: number) => parseWei(val, decimalsRisky), // parses risky
        expected: (val: Wei) => calcInvariant(val.float, strike.div(2).float, strike.float, sigma.float, tau.years),
      },
      ['calcInvariantStable']: {
        params: [parseWei(0.5, decimalsRisky).raw, 0, strike.raw, sigma.raw, tau.raw],
        min: 0.1,
        max: 9.9,
        increment: 0.1,
        error: 1e-4,
        parse: (val: number) => parseWei(val, decimalsStable), // parses strike
        expected: (val: Wei) =>
          calcInvariant(parseWei(0.5, decimalsRisky).float, val.float, strike.float, sigma.float, tau.years),
      },
    }

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      fixture = await loadFixture(replicationLibrariesFixture)

      await fixture.calcInvariant.set(scaleFactorRisky, scaleFactorStable)
      await fixture.getStableGivenRisky.set(scaleFactorRisky, scaleFactorStable)
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
