import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { PERCENTAGE, fromInt, fromPercentageInt, parseWei, Wei, percentage, fromMantissa } from './shared/Units'
import { calculateD1, calculateDelta } from './shared/BlackScholes'
import { getTradingFunction, getProportionalVol } from './shared/ReplicationMath'
import {
  Calibration,
  Reserve,
  PoolParams,
  getReserve,
  getPoolParams,
  calcRY2WithXOut,
  CreateFunction,
  createEngineFunctions,
} from './shared/Engine'
import { primitiveProtocolFixture } from './shared/fixtures'
import { expect } from 'chai'
import { std_n_cdf } from './shared/CumulativeNormalDistribution'
import { IERC20, TestCallee, TestEngine } from '../typechain'
const { createFixtureLoader } = waffle

describe('Math', function () {
  // Contracts
  let engine: TestEngine, callee: TestCallee, TX1: IERC20, TY2: IERC20
  // Pool settings
  let poolId: string, calibration: Calibration, reserve: Reserve
  // Engine Functions
  let create: CreateFunction
  // External settings
  let spot: Wei
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  let loadFixture: ReturnType<typeof createFixtureLoader>

  before('Generate fixture load', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    // get contracts
    ;({ engine, callee, TX1, TY2 } = await loadFixture(primitiveProtocolFixture))
    spot = parseWei('1000')
    const [strike, sigma, time] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600]
    calibration = { strike, sigma, time }
    ;({ create } = createEngineFunctions({
      target: callee,
      TX1,
      TY2,
      engine,
    }))
    // Create pool
    await create(spot.raw, calibration)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)

    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[callee.address] = 'Callee'
    hre.tracer.nameTags[engine.address] = 'Engine'
  })

  describe('Math', function () {
    it('CumulativeDistribution::cdf: Gets the cdf', async function () {
      const cdf = await engine.cdf(1)
      const scaled = fromMantissa(fromInt(cdf.toString()))
      const actual = std_n_cdf(1)
      expect(scaled).to.be.within(percentage(actual.toString(), 1, false), percentage(actual.toString(), 1, true))
    })

    it('CumulativeDistribution::icdf: Gets the inverse cdf', async function () {
      const cdf = await engine.icdf(parseWei('0.25').raw)
      const scaled = parseFloat(cdf.toString()) / Math.pow(2, 64)
      expect(scaled).to.be.within(-0.68, -0.66)
    })

    it('BlackScholes::calcD1: Gets the black scholes D1 auxiliary var', async function () {
      const d1 = await engine.d1(calibration, spot.raw)
      const scaled = fromMantissa(fromInt(d1.toString()))
      const actual = calculateD1(calibration, spot)
      expect(scaled, 'checking d1').to.be.within(
        percentage(actual.toString(), 1, false),
        percentage(actual.toString(), 1, true)
      )
    })

    it('BlackScholes::calcDelta: Gets the black scholes call delta', async function () {
      const delta = await engine.callDelta(calibration, spot.raw)
      const scaled = fromMantissa(fromInt(delta.toString()))
      const actual = calculateDelta(calibration, spot)
      expect(scaled, 'checking delta').to.be.within(
        percentage(actual.toString(), 1, false),
        percentage(actual.toString(), 1, true)
      )
    })

    it('ReplicationMath::calcProportionalVol:Gets the proportional volatility', async function () {
      const vol = fromMantissa(fromPercentageInt((await engine.proportionalVol(poolId)).toString()))
      const actual = getProportionalVol(calibration.sigma, calibration.time) * PERCENTAGE
      expect(vol, 'checking vol').to.be.within(
        percentage(actual.toString(), 1, false),
        percentage(actual.toString(), 1, true)
      )
    })

    it('ReplicationMath::getTradingFunction: Gets the trading function correct RY2', async function () {
      const tf = getTradingFunction(
        parseWei(1 - fromMantissa(fromInt(await engine.callDelta(calibration, spot.raw)))),
        reserve.liquidity,
        calibration
      )
      const RY2 = fromMantissa(fromInt((await engine.tradingFunction(poolId)).toString()))
      expect(RY2).to.be.within(percentage(tf.toString(), 1, false), percentage(tf.toString(), 1, true))
    })

    it('ReplicationMath::calcInvariant: Gets an amount out of R2 based on a new R1', async function () {
      const deltaOut = parseWei('0.1')
      const deltaIn = await engine.calcRY2WithXOut(poolId, deltaOut.raw)
      const params: PoolParams = await getPoolParams(engine, poolId)
      const actual = calcRY2WithXOut(deltaOut, params)
      //expect(new Wei(deltaIn).float).to.be.within(actual.float * 0.95, actual.float * 1.05) @TODO: FIX
    })
  })

  describe('#fn', function () {
    describe('sucess cases', function () {})

    describe('fail cases', function () {})
  })
})
