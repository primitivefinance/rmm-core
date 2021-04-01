import { ethers, waffle } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import {
  YEAR,
  PERCENTAGE,
  MANTISSA,
  DENOMINATOR,
  convertFromInt,
  convertFromPercentageInt,
  formatEther,
  parseWei,
  BigNumber,
  Wei,
  BigNumberish,
  toBN,
  percentage,
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
    // Reserve struct
    const RX1 = parseWei('1')
    const RY2 = parseWei('100')
    const liquidity = parseWei('1')
    reserve = { RX1, RY2, liquidity }
    // Calibration struct
    const strike = parseWei('25').raw
    const sigma = 0.1 * PERCENTAGE
    const time = 31449600 //one year
    calibration = { strike, sigma, time }
    // Create pool
    await engine.create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    // add some liquidity
    await expect(house.addLiquidity(poolId, nonce, parseWei('1000').raw)).to.emit(engine, 'AddedBoth')
    // remove some liquidity to get BX1 and BY2 balances.
    await expect(engine.removeBoth(poolId, nonce, parseWei('500').raw)).to.emit(engine, 'RemovedBoth')
  })

  it('Gets the cdf', async function () {
    const cdf = await engine.getCDF(1)
    const scaled = convertFromInt(cdf.toString())

    console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${cdf.toString()}
        uint:   ${scaled.toString()}
    `)
  })

  it('Gets the inverse cdf', async function () {
    const cdf = await engine.getInverseCDFTest()
    const scaled = convertFromInt(cdf.toString())

    console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${cdf.toString()}
        uint:   ${scaled.toString()}
    `)
  })

  it('Gets the black scholes call delta', async function () {
    const delta = await engine.getCallDelta(calibration, spot.raw)
    const scaled = convertFromInt(delta.toString())
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

  it('Gets the proportional volatility', async function () {
    const rawVol = toBN(await engine.proportionalVol(poolId)).mul(PERCENTAGE)
    const vol = convertFromPercentageInt((await engine.proportionalVol(poolId)).toString())
    const actual = getProportionalVol(calibration.sigma, calibration.time) * PERCENTAGE
    console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${rawVol.toString()}
        vol:    ${vol.toString()}
        actual: ${actual.toString()}
    `)
    expect(vol, 'checking vol').to.be.within(percentage(actual.toString(), 1, false), percentage(actual.toString(), 1, true))
  })

  it('Gets the trading function correct RY2', async function () {
    const vol = convertFromPercentageInt((await engine.proportionalVol(poolId)).toString())
    const tf = getTradingFunction(reserve.RX1, reserve.liquidity, calibration)
    const RY2 = convertFromInt((await engine.tradingFunction(poolId)).toString())
    console.log(`
        vol:    ${vol.toString()}
        RY2:     ${RY2.toString()}
        tf:     ${tf.toString()}
    `)

    //expect(RY2).to.be.within(percentage(tf.toString(), 1, false), percentage(tf.toString(), 1, true))
  })

  it('Gets an amount out of R2 based on input of R1', async function () {
    const deltaX = parseWei('1')
    const r2New = convertFromInt(await engine._getOutputR2(poolId, deltaX.raw))
    const r2Scaled = await engine._getOutputR2Scaled(poolId, deltaX.raw)
    const deltaY = await engine.getOutputAmount(poolId, deltaX.raw)
    const params: PoolParams = await getPoolParams(engine, poolId)
    const actual = getOutputAmount(params, deltaX)
    console.log(`
        r2New:      ${r2New.toString()}
        r2Scaled:   ${r2Scaled}
        deltaY:     ${formatEther(deltaY)}
        actual:     ${actual.parsed}
    `)

    expect(new Wei(deltaY).float).to.be.within(actual.float * 0.99, actual.float * 1.01)
  })

  it('Add both X and Y', async function () {
    const invariant = await engine.invariantLast(poolId)
    const deltaL = parseWei('1')
    const params: PoolParams = await getPoolParams(engine, poolId)
    const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
    console.log(`
        invariant:      ${convertFromInt(invariant)}
        postInvariant:  ${postInvariant}
    `)
    await expect(house.addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
    const pos = await getPosition(engine, signer.address, nonce, true)
  })

  it('Remove both X and Y', async function () {
    // then remove it
    const invariant = await engine.invariantLast(poolId)
    const liquidity = new Wei((await engine.getReserve(poolId)).liquidity)
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
      invariant:      ${convertFromInt(invariant)}
      postInvariant:  ${postInvariant}
      actual:         ${actual.toString()}
    `)
    await expect(engine.removeBoth(poolId, nonce, deltaL.raw)).to.emit(engine, 'RemovedBoth')
    console.log(`
      RX1: ${formatEther((await engine.getReserve(poolId)).RX1)}
      RY2: ${formatEther((await engine.getReserve(poolId)).RY2)}
      liquidity: ${formatEther((await engine.getReserve(poolId)).liquidity)}
      invariantLast: ${formatEther(await engine.invariantLast(poolId))}
    `)
  })

  it('AddX: Swap X to Y', async function () {
    const invariant = await engine.invariantLast(poolId)
    const fee = await engine.FEE()
    const deltaX = parseWei('0.2')
    const params: PoolParams = await getPoolParams(engine, poolId)
    const output: SwapXOutput = getDeltaY(deltaX, invariant.toString(), fee, params)
    const minDeltaY = output.deltaY
    const postR1 = output.postParams.reserve.RX1
    const postR2 = output.postParams.reserve.RY2

    const { deltaY, feePaid, postParams, postInvariant } = getDeltaY(deltaX, invariant, fee, params)
    console.log(`
      deltaY:         ${minDeltaY.parsed}
      feePaid:        ${output.feePaid.parsed}
      postR2:         ${postR2.parsed}
      invariant:      ${convertFromInt(invariant)}
      postInvariant:  ${postInvariant}
    `)
    await expect(engine.addX(poolId, signer.address, nonce, deltaX.raw, minDeltaY.raw), 'Engine:AddX').to.emit(
      engine,
      EngineEvents.ADDED_X
    )
    expect(postR1, 'check FXR1').to.be.eq((await engine.getReserve(poolId)).RX1)
    //expect(postR2, 'check FYR2').to.be.eq((await engine.getReserve(poolId)).RY2) // FIX
  })

  it('RemoveX: Swap Y to X', async function () {
    const reserves = await engine.getReserve(poolId)
    const RX1 = reserves.RX1
    const RY2 = reserves.RY2
    const liquidity = reserves.liquidity
    const invariant = await engine.invariantLast(poolId)
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
      invariant:      ${convertFromInt(invariant)}
      postInvariant:  ${postInvariant}
    `)
    await expect(engine.removeX(poolId, signer.address, nonce, deltaX.raw, maxDeltaY.raw), 'Engine:RemoveX').to.emit(
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

  it('Fail AddX: No X balance', async function () {
    await expect(engine.addX(poolId, signer2.address, 0, parseWei('0.1').raw, '0')).to.be.revertedWith('Not enough X')
  })

  it('Fail RemoveX: No Y balance', async function () {
    await expect(
      engine.removeX(poolId, signer2.address, 0, parseWei('0.1').raw, ethers.constants.MaxUint256)
    ).to.be.revertedWith('Not enough Y')
  })

  it('Fail RemoveBoth: No L balance', async function () {
    await expect(engine.connect(signer2).removeBoth(poolId, 0, parseWei('0.1').raw)).to.be.revertedWith('Not enough L')
  })

  it('DirectDeposit: Adds X and Y directly', async function () {
    const amount = parseWei('200').raw
    await expect(house.addDirect(nonce, amount, amount)).to.emit(engine, 'PositionUpdated')
  })

  it('DirectWithdrawl: Removes X and Y directly', async function () {
    const amount = parseWei('200').raw
    // add direct
    await expect(house.addDirect(nonce, amount, amount)).to.emit(engine, 'PositionUpdated')
    // remove direct
    await expect(house.removeDirect(nonce, amount, amount)).to.emit(engine, 'PositionUpdated')
  })
})
