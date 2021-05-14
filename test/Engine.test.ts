import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import {
  YEAR,
  PERCENTAGE,
  MANTISSA,
  DENOMINATOR,
  fromInt,
  fromPercentageInt,
  formatEther,
  parseWei,
  BigNumber,
  Wei,
  BigNumberish,
  toBN,
  percentage,
  fromMantissa,
  fromWithin,
} from './shared/Units'
import { calculateD1, calculateDelta } from './shared/BlackScholes'
import { getTradingFunction, getProportionalVol } from './shared/ReplicationMath'
import {
  Calibration,
  Position,
  Reserve,
  calculateInvariant,
  EngineEvents,
  PoolParams,
  getReserve,
  getCalibration,
  getPosition,
  getPoolParams,
  addBoth,
  ERC20Events,
  getMargin,
  getDeltaIn,
  calcRX1WithYOut,
  calcRY2WithXOut,
  Swap,
  removeBoth,
} from './shared/Engine'
import { engineFixture, EngineFixture } from './shared/fixtures'
import { expect } from 'chai'
import { std_n_cdf } from './shared/CumulativeNormalDistribution'
const { createFixtureLoader } = waffle

describe('Primitive Engine', function () {
  let fixture: EngineFixture
  // Contracts
  let engine: Contract, house: Contract, TX1: Contract, TY2: Contract
  // Pool settings
  let poolId: string, calibration: Calibration, reserve: Reserve
  // External settings
  let nonce: number, spot: Wei
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  const loadFixture = createFixtureLoader([signer], waffle.provider)
  const INITIAL_MARGIN = parseWei('1000')

  const mintTokens = async (wad, guy, spender) => {
    await TX1.mint(guy, wad.raw)
    await TY2.mint(guy, wad.raw)
    // approve tokens
    wad = new Wei(ethers.constants.MaxUint256)
    await TX1.approve(spender, wad.raw)
    await TY2.approve(spender, wad.raw)
  }

  beforeEach(async function () {
    // get contracts
    fixture = await loadFixture(engineFixture)
    engine = fixture.engine
    house = fixture.house
    TX1 = fixture.TX1
    TY2 = fixture.TY2
    // init external settings
    nonce = 0
    spot = parseWei('1000')
    // init pool settings
    // Calibration struct
    const strike = parseWei('1000').raw
    const sigma = 0.85 * PERCENTAGE
    const time = 31449600 //one year
    calibration = { strike, sigma, time }
    // Create pool
    await engine.create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)

    // add margin
    let wad = parseWei('25000000')
    await mintTokens(wad, signer.address, house.address)
    await expect(house.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw))
      .to.emit(engine, EngineEvents.DEPOSITED)
      .withArgs(house.address, signer.address, INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)

    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[house.address] = 'House'
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
      const scaled = parseFloat(cdf) / Math.pow(2, 64)
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

  describe('Margin', function () {
    it('Fail House::AddX: No X balance', async function () {
      // before: add initial margin
      await expect(engine.withdraw(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)).to.emit(engine, EngineEvents.WITHDRAWN)
      await expect(house.swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)).to.be.revertedWith(
        ERC20Events.EXCEEDS_BALANCE
      )
    })

    it('Fail House::RemoveX: No Y balance', async function () {
      // before: add initial margin
      await expect(engine.withdraw(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)).to.emit(engine, EngineEvents.WITHDRAWN)
      await expect(house.swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)).to.be.revertedWith(
        ERC20Events.EXCEEDS_BALANCE
      )
    })

    it('House::Deposit: Adds X and Y directly', async function () {
      // before: deposit INITIAL MARGIN
      // withdraw initial margin
      await engine.withdraw(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
      const amount = parseWei('200').raw
      // deposit 200
      await expect(house.deposit(amount, amount))
        .to.emit(engine, EngineEvents.DEPOSITED)
        .withArgs(house.address, signer.address, amount, amount)
      const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
      expect(owner).to.be.eq(signer.address)
      expect(BX1.raw).to.be.eq(amount)
      expect(BY2.raw).to.be.eq(amount)
      expect(unlocked).to.be.eq(false)
    })

    it('Engine::Withdraw: Removes X and Y directly', async function () {
      // before: deposit 100
      const amount = INITIAL_MARGIN.raw
      // remove 100
      await expect(engine.withdraw(amount, amount))
        .to.emit(engine, EngineEvents.WITHDRAWN)
        .withArgs(signer.address, signer.address, amount, amount)
      // deposit 100
      await house.deposit(amount, amount)
      // remove 100
      await expect(() => engine.withdraw(amount, amount)).to.changeTokenBalance(TX1, signer, amount)
      const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
      expect(owner).to.be.eq(signer.address)
      expect(BX1.raw).to.be.eq(0)
      expect(BY2.raw).to.be.eq(0)
      expect(unlocked).to.be.eq(false)
    })
  })

  describe('Liquidity', function () {
    it('Engine::AddBoth: Add both X and Y', async function () {
      const invariant = await engine.getInvariantLast(poolId)
      const deltaL = parseWei('1')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
      await expect(house.addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
      expect(postInvariant).to.be.gte(new Wei(invariant).float)
      expect(params.reserve.RX1.add(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
      expect(params.reserve.RY2.add(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
      expect(params.reserve.liquidity.add(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
    })

    it('Engine::RemoveBoth: Remove both X and Y', async function () {
      // Add some liq to remove it
      await expect(house.addLiquidity(poolId, nonce, parseWei('1').raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
      // fetch current state
      const invariant = await engine.getInvariantLast(poolId)
      const liquidity = (await getReserve(engine, poolId)).liquidity
      const deltaL = liquidity.sub(await engine.INIT_SUPPLY())
      const params: PoolParams = await getPoolParams(engine, poolId)
      const postLiquidity = liquidity.sub(deltaL)
      // calc amounts removed
      const [deltaX, deltaY, postParams, postInvariant] = removeBoth(deltaL, params)
      // remove liquidity
      await expect(engine.removeBoth(poolId, nonce, deltaL.raw, true)).to.emit(engine, 'RemovedBoth')
      expect(postInvariant).to.be.gte(parseFloat(invariant))
      expect(postLiquidity.raw).to.be.eq(postParams.reserve.liquidity.raw)
      expect(params.reserve.RX1.sub(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
      expect(params.reserve.RY2.sub(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
      expect(params.reserve.liquidity.sub(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
    })

    it('Fail Engine::RemoveBoth: No L balance', async function () {
      await expect(engine.connect(signer2).removeBoth(poolId, 0, parseWei('0.1').raw, true)).to.be.reverted
    })
  })

  describe('Swaps', function () {
    it('Engine::Swap: Swap X to Y from EOA', async function () {
      // before: add tokens to margin to do swaps with
      const invariant = await engine.getInvariantLast(poolId)
      const amount = parseWei('100')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const addXRemoveY: boolean = true
      const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)
      // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
      await expect(engine.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
        engine,
        EngineEvents.SWAP
      )

      const postReserve = await engine.getReserve(poolId)
      //expect(postInvariant).to.be.gte(new Wei(invariant).float)
      expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
      expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
    })

    it('Engine::Swap: Swap X to Y from House', async function () {
      // before: add tokens to margin to do swaps with
      const invariant = await engine.getInvariantLast(poolId)
      const amount = parseWei('100')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const addXRemoveY: boolean = true
      const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)
      // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
      await expect(house.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
        engine,
        EngineEvents.SWAP
      )

      const postReserve = await engine.getReserve(poolId)
      //expect(postInvariant).to.be.gte(new Wei(invariant).float)
      expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
      expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
    })

    it('Engine::Swap: Swap Y to X from EOA', async function () {
      const invariant = await engine.getInvariantLast(poolId)
      const amount = parseWei('0.2')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const addXRemoveY: boolean = false
      const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)

      // TODO: Swap deltaIn amount is different from esimated deltaIn
      await expect(engine.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
        engine,
        EngineEvents.SWAP
      )

      const postReserve = await engine.getReserve(poolId)
      //expect(postInvariant).to.be.gte(new Wei(invariant).float)
      expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
      expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
    })

    it('Engine::Swap: Swap Y to X from House', async function () {
      const invariant = await engine.getInvariantLast(poolId)
      const amount = parseWei('0.2')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const addXRemoveY: boolean = false
      const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)

      // TODO: Swap deltaIn amount is different from esimated deltaIn
      await expect(house.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
        engine,
        EngineEvents.SWAP
      )

      const postReserve = await engine.getReserve(poolId)
      //expect(postInvariant).to.be.gte(new Wei(invariant).float)
      expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
      expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
    })
  })

  describe('Lending', function () {
    it('Engine::lend: Increase a positions float', async function () {})
    it('Engine::borrow: Increase a positions loan debt', async function () {})
    it('Engine::repay: Decrease a positions loan debt', async function () {})
  })
})
