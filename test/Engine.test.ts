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
import { calculateDelta } from './shared/BlackScholes'
import { getTradingFunction, getProportionalVol } from './shared/ReplicationMath'
import {
  Calibration,
  Position,
  Reserve,
  SwapXOutput,
  getOutputAmount,
  getDeltaY,
  calculateInvariant,
  EngineEvents,
  PoolParams,
  getReserve,
  getCalibration,
  getPosition,
  getPoolParams,
  addBoth,
  ERC20EVents,
} from './shared/Engine'
import { engineFixture, EngineFixture } from './shared/fixtures'
import { expect } from 'chai'
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

  beforeEach(async function () {
    // get contracts
    fixture = await loadFixture(engineFixture)
    engine = fixture.engine
    house = fixture.house
    TX1 = fixture.TX1
    TY2 = fixture.TY2
    // mint tokens
    let wad = parseWei('25000000')
    let guy = signer.address
    await TX1.mint(guy, wad.raw)
    await TY2.mint(guy, wad.raw)
    // approve tokens
    wad = new Wei(ethers.constants.MaxUint256)
    guy = house.address
    await TX1.approve(guy, wad.raw)
    await TY2.approve(guy, wad.raw)
    // init external settings
    nonce = 0
    spot = parseWei('25')
    // init pool settings
    // Calibration struct
    const strike = parseWei('25').raw
    const sigma = 0.1 * PERCENTAGE
    const time = 31449600 //one year
    calibration = { strike, sigma, time }
    // Create pool
    await engine.create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)
    if (false)
      console.log(`
      ===== Initial Conditions: =====
      delta: ${fromMantissa(fromInt(await engine.callDelta(calibration, spot.raw)))}
      RX1: ${1 - fromMantissa(fromInt(await engine.callDelta(calibration, spot.raw)))}
      ActualRX1: ${reserve.RX1.parsed}
      ActualRX2: ${reserve.RY2.parsed}
      ===== End =====
    `)
    // add some liquidity
    //await expect(house.addLiquidity(poolId, nonce, parseWei('1000').raw)).to.emit(engine, 'AddedBoth')
    // remove some liquidity to get BX1 and BY2 balances.
    //await expect(engine.removeBoth(poolId, nonce, parseWei('500').raw, true)).to.emit(engine, 'RemovedBoth')
    // depost
    await expect(house.deposit(parseWei('100').raw, parseWei('100').raw)).to.emit(engine, 'Deposited')

    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[house.address] = 'House'
    hre.tracer.nameTags[engine.address] = 'Engine'
  })

  describe('Math', function () {
    it('CumulativeDistribution::cdf: Gets the cdf', async function () {
      const cdf = await engine.cdf(1)
      const scaled = fromMantissa(fromInt(cdf.toString()))

      console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${cdf.toString()}
        uint:   ${scaled.toString()}
    `)
      expect(scaled).to.be.within(0.84, 0.845)
    })

    it('CumulativeDistribution::icdf: Gets the inverse cdf', async function () {
      const cdf = await engine.icdf(parseWei('0.25').raw)
      const scaled = parseFloat(cdf) / Math.pow(2, 64)

      console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${cdf.toString()}
        uint:   ${scaled.toString()}
    `)
      expect(scaled).to.be.within(-0.68, -0.66)
    })

    it('BlackScholes::calcDelta: Gets the black scholes call delta', async function () {
      const delta = await engine.callDelta(calibration, spot.raw)
      const scaled = fromMantissa(fromInt(delta.toString()))
      const actual = calculateDelta(calibration, spot)

      console.log(`
        raw:    ${delta.toString()}
        uint:   ${scaled.toString()}
        actual: ${actual.toString()}
    `)
      expect(scaled, 'checking delta').to.be.within(
        percentage(actual.toString(), 1, false),
        percentage(actual.toString(), 1, true)
      )
    })

    it('ReplicationMath::calcProportionalVol:Gets the proportional volatility', async function () {
      const rawVol = toBN(await engine.proportionalVol(poolId)).mul(PERCENTAGE)
      const vol = fromMantissa(fromPercentageInt((await engine.proportionalVol(poolId)).toString()))
      const actual = getProportionalVol(calibration.sigma, calibration.time) * PERCENTAGE
      console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${rawVol.toString()}
        vol:    ${vol.toString()}
        actual: ${actual.toString()}
    `)
      expect(vol, 'checking vol').to.be.within(
        percentage(actual.toString(), 1, false),
        percentage(actual.toString(), 1, true)
      )
    })

    it('ReplicationMath::getTradingFunction: Gets the trading function correct RY2', async function () {
      const vol = fromPercentageInt((await engine.proportionalVol(poolId)).toString())
      const tf = getTradingFunction(
        parseWei(1 - fromMantissa(fromInt(await engine.callDelta(calibration, spot.raw)))),
        reserve.liquidity,
        calibration
      )
      const RY2 = fromMantissa(fromInt((await engine.tradingFunction(poolId)).toString()))
      console.log(`
        vol:    ${vol.toString()}
        RY2:     ${RY2.toString()}
        tf:     ${tf.toString()}
    `)

      expect(RY2).to.be.within(percentage(tf.toString(), 1, false), percentage(tf.toString(), 1, true))
    })

    it('ReplicationMath::calcInvariant: Gets an amount out of R2 based on input of R1', async function () {
      const deltaX = parseWei('1')
      const deltaY = await engine.getOutputAmount(poolId, deltaX.raw)
      const params: PoolParams = await getPoolParams(engine, poolId)
      const actual = getOutputAmount(params, deltaX)
      console.log(`
        deltaY:     ${formatEther(deltaY)}
        actual:     ${actual.parsed}
    `)

      expect(new Wei(deltaY).float).to.be.within(actual.float * 0.95, actual.float * 1.05)
    })
  })

  describe('Liquidity', function () {
    it('Engine::AddBoth: Add both X and Y', async function () {
      const invariant = await engine.getInvariantLast(poolId)
      const deltaL = parseWei('1')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
      console.log(`
        invariant:      ${fromInt(invariant)}
        postInvariant:  ${postInvariant}
    `)
      await expect(house.addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
    })

    it('Engine::RemoveBoth: Remove both X and Y', async function () {
      // Add some liq to remove it
      await expect(house.addLiquidity(poolId, nonce, parseWei('1').raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
      const invariant = await engine.getInvariantLast(poolId)
      const liquidity = (await getReserve(engine, poolId)).liquidity
      const deltaL = liquidity.sub(await engine.INIT_SUPPLY())

      const postLiquidity = liquidity.sub(deltaL)
      const params: PoolParams = await getPoolParams(engine, poolId)
      const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
      console.log(`
      RX1: ${formatEther((await engine.getReserve(poolId)).RX1)}
      RY2: ${formatEther((await engine.getReserve(poolId)).RY2)}
      liquidity: ${liquidity.parsed}
      deltaL: ${deltaL.parsed}
      deltaX: ${deltaX.parsed}
      deltaY: ${deltaY.parsed}
      postR1: ${postParams.reserve.RX1.parsed}
      postR2: ${postParams.reserve.RY2.parsed}
      postLiquidity: ${postLiquidity.parsed}
    `)

      const actual = calculateInvariant(params)
      console.log(`
      invariant:      ${fromInt(invariant)}
      postInvariant:  ${postInvariant}
      actual:         ${actual.toString()}
    `)
      await expect(engine.removeBoth(poolId, nonce, deltaL.raw, true)).to.emit(engine, 'RemovedBoth')
      console.log(`
      RX1: ${formatEther((await engine.getReserve(poolId)).RX1)}
      RY2: ${formatEther((await engine.getReserve(poolId)).RY2)}
      liquidity: ${formatEther((await engine.getReserve(poolId)).liquidity)}
      invariantLast: ${formatEther(await engine.getInvariantLast(poolId))}
    `)
    })
  })

  describe('Swaps', function () {
    it('Engine::AddX: Swap X to Y', async function () {
      const invariant = await engine.getInvariantLast(poolId)
      const fee = await engine.FEE()
      const deltaX = parseWei('0.2')
      const params: PoolParams = await getPoolParams(engine, poolId)

      const { deltaY, feePaid, postParams, postInvariant } = getDeltaY(deltaX, invariant, fee, params)
      console.log(`
      minDeltaY:      ${deltaY.parsed}
      feePaid:        ${feePaid.parsed}
      postR2:         ${postParams.reserve.RY2.parsed}
      invariant:      ${fromInt(invariant)}
      postInvariant:  ${postInvariant}
    `)
      await expect(engine.addX(poolId, signer.address, deltaX.raw, deltaY.raw), 'Engine:AddX').to.emit(
        engine,
        EngineEvents.ADDED_X
      )
      const postR2 = new Wei((await engine.getReserve(poolId)).RY2)
      expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq((await engine.getReserve(poolId)).RX1)
      //expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.within(fromWithin(postR2, 0.01)[0], fromWithin(postR2, 0.01)[1]) // FIX
    })

    it('Engine::RemoveX: Swap Y to X', async function () {
      const reserves = await engine.getReserve(poolId)
      const RX1 = reserves.RX1
      const RY2 = reserves.RY2
      const liquidity = reserves.liquidity
      const invariant = await engine.getInvariantLast(poolId)
      const fee = await engine.FEE()
      const deltaX = parseWei('0.2')
      const params: PoolParams = await getPoolParams(engine, poolId)
      const output: SwapXOutput = getDeltaY(deltaX.mul(-1), invariant.toString(), fee, params)
      const maxDeltaY = new Wei(ethers.constants.MaxUint256) // FIXL output.deltaY
      const postR1 = output.postParams.reserve.RX1
      const postR2 = output.postParams.reserve.RY2

      const { deltaY, feePaid, postParams, postInvariant } = getDeltaY(deltaX, invariant, fee, params)

      console.log(`
      deltaY[FIX]:    ${maxDeltaY.float}
      feePaid:        ${output.feePaid.float}
      postR2:         ${postR2.float}
      invariant:      ${fromInt(invariant)}
      postInvariant:  ${postInvariant}
    `)
      await expect(engine.removeX(poolId, signer.address, deltaX.raw, maxDeltaY.raw), 'Engine:RemoveX').to.emit(
        engine,
        'RemovedX'
      )
      expect(postR1.raw.toString(), 'check FXR1').to.be.eq((await engine.getReserve(poolId)).RX1)
      //expect(postR2, 'check FYR2').to.be.eq((await engine.getReserve(poolId)).RY2) // FIX
      const FYR2 = (await engine.getReserve(poolId)).RY2
      const actualDeltaY = toBN(FYR2).sub(RY2)
      console.log(`
      actualDeltaY:   ${formatEther(actualDeltaY)}
    `)
    })
  })

  describe('Margin', function () {
    it('Fail House::AddX: No X balance', async function () {
      await expect(engine.withdraw(parseWei('100').raw, parseWei('100').raw)).to.emit(engine, EngineEvents.WITHDRAWN)
      await expect(house.addX(poolId, parseWei('0.1').raw, '0')).to.be.revertedWith(ERC20EVents.EXCEEDS_BALANCE)
    })

    it('Fail House::RemoveX: No Y balance', async function () {
      await expect(engine.withdraw(parseWei('100').raw, parseWei('100').raw)).to.emit(engine, EngineEvents.WITHDRAWN)
      await expect(house.removeX(poolId, parseWei('0.1').raw, ethers.constants.MaxUint256)).to.be.revertedWith(
        ERC20EVents.EXCEEDS_BALANCE
      )
    })

    it('Fail Engine::RemoveBoth: No L balance', async function () {
      await expect(engine.connect(signer2).removeBoth(poolId, 0, parseWei('0.1').raw, true)).to.be.reverted
    })

    it('House::Deposit: Adds X and Y directly', async function () {
      const amount = parseWei('200').raw
      await expect(house.deposit(amount, amount)).to.emit(engine, EngineEvents.MARGIN_UPDATED)
    })

    it('Engine::Withdraw: Removes X and Y directly', async function () {
      const amount = parseWei('200').raw
      // add direct
      await expect(house.deposit(amount, amount)).to.emit(engine, EngineEvents.MARGIN_UPDATED)
      // remove direct
      await expect(engine.withdraw(amount, amount))
        .to.emit(engine, EngineEvents.MARGIN_UPDATED)
        .to.emit(engine, EngineEvents.WITHDRAWN)
    })
  })
})
