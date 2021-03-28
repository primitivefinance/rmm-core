import { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber, BigNumberish } from 'ethers'
import { engineFixture, EngineFixture } from './shared/fixtures'
import { formatEther, parseEther } from '@ethersproject/units'
import * as utils from './shared/utils'
import bn from 'bignumber.js'
import { expect } from 'chai'
const { createFixtureLoader } = waffle

const YEAR = 31449600
const DENOMINATOR = 2 ** 64

function toBN(val: BigNumberish): BigNumber {
  return BigNumber.from(val.toString())
}
function weiToNumber(wei: string): number {
  return Number(formatEther(wei))
}

function getProportionalVol(sigma: string, time: string): number {
  return Number(toBN(sigma).mul(toBN(new bn(time).div(YEAR).sqrt().toString())))
}

function getTradingFunction(r1: string, strike: string, sigma: string, time: string): number {
  const K = weiToNumber(strike)
  const vol = getProportionalVol(sigma, time)
  const one = 1
  const phi = utils.std_n_cdf(one)
  const reserve = weiToNumber(r1)
  const input = ((1 / phi) * (1 - reserve) * utils.PERCENTAGE - vol) / utils.PERCENTAGE
  const r2 = K * utils.std_n_cdf(input)
  return parseFloat(r2.toString())
}

interface Parameters {
  strike: string
  r1: string
  r2: string
  sigma: string
  time: string
}

function getOutputAmount(params: Parameters, deltaX: string): number {
  const r1 = toBN(params.r1).add(deltaX).toString()
  const r2 = parseEther(getTradingFunction(r1, params.strike, params.sigma, params.time).toString())
  const deltaY = r2.gt(params.r2) ? r2.sub(params.r2) : toBN(params.r2).sub(r2)
  return weiToNumber(deltaY.toString())
}

function getInvariant(params: Parameters): number {
  const input = getTradingFunction(
    params.r1.toString(),
    params.strike.toString(),
    params.sigma.toString(),
    params.time.toString()
  )
  const k = toBN(params.r2).sub(parseEther(input > 0.0001 ? input.toString() : '0'))
  return weiToNumber(k.toString())
}

function percentage(val: string, percentage: number, add: boolean): number {
  val = parseEther(val).toString()
  return weiToNumber(
    toBN(val)
      .mul(add ? 100 + percentage : 100 - percentage)
      .div(100)
      .toString()
  )
}

interface SwapXOutput {
  FXR1: BigNumber
  FXR2: BigNumber
  deltaY: BigNumber
  feePaid: BigNumber
}

/**
 * @notice Returns the amount of Y removed by adding X.
 * @param deltaX The amount of X to add or remove, can be negative.
 * @param invariantInt128 The previous invariant value.
 * @param fee The amount of Y kept as a fee.
 * @param params Parameters of the engine, including strike,time,sigma,r1,r2
 * @returns Next R1 amount
 * @returns Next R2 amount
 * @returns Amount of Y output
 */
function getDeltaY(deltaX: string, invariantInt128: string, fee: string, params: Parameters): SwapXOutput {
  const r1 = params.r1.toString()
  const r2 = params.r2.toString()
  const invariant = parseEther(utils.convertFromInt(invariantInt128).toString())
  let FXR1 = toBN(r1).add(deltaX)
  const FX = parseEther(getTradingFunction(FXR1.toString(), params.strike, params.sigma, params.time).toString())
  let FXR2 = invariant.add(FX)
  let deltaY = FXR2.gt(r2) ? FXR2.sub(r2) : toBN(r2).sub(FXR2)
  let feePaid = deltaY.div(fee)
  const yToX = toBN(deltaX).isNegative()
  deltaY = yToX ? deltaY.add(feePaid) : deltaY.sub(feePaid)
  FXR2 = yToX ? toBN(r2.toString()).add(deltaY) : toBN(r2.toString()).sub(deltaY)
  return { FXR1, FXR2, deltaY, feePaid }
}

describe('Primitive Engine', function () {
  let fixture: EngineFixture
  let r1: BigNumberish, r2: BigNumberish, strike: BigNumberish, sigma: BigNumberish, time: BigNumberish
  let engine: Contract, nonce: number
  let [signer] = waffle.provider.getWallets()
  const loadFixture = createFixtureLoader([signer], waffle.provider)

  beforeEach(async function () {
    fixture = await loadFixture(engineFixture)
    engine = fixture.engine
    let deltaX = parseEther('1')
    let deltaY = parseEther('100')
    nonce = 0
    r1 = parseEther('1')
    r2 = parseEther('100')
    strike = parseEther('25')
    sigma = 0.1 * utils.PERCENTAGE
    time = 31449600 //one year
    // init params
    await engine.initialize(strike, sigma, time)
    // init liquidity and balances
    await engine.start(deltaX, deltaY)
    // add some liquidity
    await engine.addBoth(nonce, parseEther('1'))
  })

  it('Gets the cdf', async function () {
    const cdf = await engine.getCDF(1)
    const scaled = utils.convertFromInt(cdf.toString())

    console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${cdf.toString()}
        uint:   ${scaled.toString()}
    `)
  })

  it('Gets the proportional volatility', async function () {
    const rawVol = toBN(await engine.proportionalVol()).mul(utils.PERCENTAGE)
    const vol = utils.convertFromPercentageInt((await engine.proportionalVol()).toString())
    const actual = getProportionalVol(sigma.toString(), time.toString()) * utils.PERCENTAGE
    console.log(`
        denom:  ${DENOMINATOR.toString()}
        raw:    ${rawVol.toString()}
        vol:    ${vol.toString()}
        actual: ${actual.toString()}
    `)
    expect(vol).to.be.within(percentage(actual.toString(), 1, false), percentage(actual.toString(), 1, true))
  })

  it('Gets the trading function correct r2', async function () {
    const vol = utils.convertFromPercentageInt((await engine.proportionalVol()).toString())
    const tf = getTradingFunction(r1.toString(), strike.toString(), sigma.toString(), time.toString())
    const r2 = utils.convertFromInt((await engine.tradingFunction()).toString())
    console.log(`
        vol:    ${vol.toString()}
        r2:     ${r2.toString()}
        tf:     ${tf.toString()}
    `)

    //expect(r2).to.be.within(percentage(tf.toString(), 1, false), percentage(tf.toString(), 1, true))
  })

  it('Gets an amount out of R2 based on input of R1', async function () {
    const deltaX = parseEther('1')
    const r2New = utils.convertFromInt(await engine._getOutputR2(deltaX))
    const r2Scaled = await engine._getOutputR2Scaled(deltaX)
    const deltaY = await engine.getOutputAmount(deltaX)
    const params: Parameters = {
      strike: strike.toString(),
      r1: (await engine.getCapital()).RX1,
      r2: (await engine.getCapital()).RX2,
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const actual = getOutputAmount(params, deltaX.toString())
    console.log(`
        r2New:      ${r2New.toString()}
        r2Scaled:   ${r2Scaled}
        deltaY:     ${formatEther(deltaY)}
        actual:     ${actual}
    `)

    expect(weiToNumber(deltaY)).to.be.within(actual * 0.99, actual * 1.01)
  })

  it('Add both X and Y', async function () {
    const invariant = await engine.invariantLast()
    const capital = await engine.getCapital()
    const RX1 = capital.RX1
    const RX2 = capital.RX2
    const liquidity = capital.liquidity
    const deltaL = parseEther('1')
    const deltaX = deltaL.mul(RX1).div(liquidity)
    const deltaY = deltaL.mul(RX2).div(liquidity)
    const postR1 = deltaX.add(RX1)
    const postR2 = deltaY.add(RX2)
    const postInvariant = await engine.getInvariant(postR1, postR2)
    const params: Parameters = {
      strike: strike.toString(),
      r1: postR1.toString(),
      r2: postR2.toString(),
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const actual = getInvariant(params)
    console.log(`
        invariant:      ${utils.convertFromInt(invariant)}
        postInvariant:  ${utils.convertFromInt(postInvariant)}
        actual:         ${actual.toString()}
    `)
    await expect(engine.addBoth(nonce, deltaL)).to.emit(engine, 'AddedBoth')
    const pos = await engine.getPosition(signer.address, nonce)
    console.log(`
      owner: ${pos.owner}
      nonce: ${pos.nonce}
      BX1:   ${pos.BX1}
      BY2:   ${pos.BY2}
      liquidity: ${pos.liquidity}
      unlocked: ${pos.unlocked}
    `)
  })

  it('Remove both X and Y', async function () {
    // then remove it
    const invariant = await engine.invariantLast()
    const liquidity = (await engine.getCapital()).liquidity
    const deltaL = toBN(liquidity).sub(await engine.INIT_SUPPLY())
    const deltaX = deltaL.mul((await engine.getCapital()).RX1).div(liquidity)
    const deltaY = deltaL.mul((await engine.getCapital()).RX2).div(liquidity)
    const postR1 = toBN((await engine.getCapital()).RX1).sub(deltaX)
    const postR2 = toBN((await engine.getCapital()).RX2).sub(deltaY)
    const postLiquidity = toBN(liquidity).sub(deltaL)
    console.log(`
      r1: ${formatEther((await engine.getCapital()).RX1)}
      r2: ${formatEther((await engine.getCapital()).RX2)}
      liquidity: ${formatEther(liquidity)}
      deltaL: ${formatEther(deltaL)}
      deltaX: ${formatEther(deltaX)}
      deltaY: ${formatEther(deltaY)}
      postR1: ${formatEther(postR1)}
      postR2: ${formatEther(postR2)}
      postLiquidity: ${formatEther(postLiquidity)}
    `)
    const postInvariant = await engine.getInvariant(postR1, postR2)
    const params: Parameters = {
      strike: strike.toString(),
      r1: postR1.toString(),
      r2: postR2.toString(),
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const actual = getInvariant(params)
    console.log(`
      invariant:      ${utils.convertFromInt(invariant)}
      postInvariant:  ${utils.convertFromInt(postInvariant)}
      actual:         ${actual.toString()}
    `)
    await expect(engine.removeBoth(nonce, deltaL)).to.emit(engine, 'RemovedBoth')
    console.log(`
      r1: ${formatEther((await engine.getCapital()).RX1)}
      r2: ${formatEther((await engine.getCapital()).RX2)}
      liquidity: ${formatEther((await engine.getCapital()).liquidity)}
      invariantLast: ${formatEther(await engine.invariantLast())}
    `)
  })

  it('AddX: Swap X to Y', async function () {
    const capital = await engine.getCapital()
    const RX1 = capital.RX1
    const RX2 = capital.RX2
    const liquidity = capital.liquidity
    const invariant = await engine.invariantLast()
    const fee = await engine.FEE()
    const deltaX = parseEther('0.2')
    const params: Parameters = {
      strike: strike.toString(),
      r1: RX1,
      r2: RX2,
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const output: SwapXOutput = getDeltaY(deltaX.toString(), invariant.toString(), fee.toString(), params)
    const minDeltaY = output.deltaY
    const postR1 = output.FXR1
    const postR2 = output.FXR2

    const postParams: Parameters = {
      strike: strike.toString(),
      r1: postR1.toString(),
      r2: postR2.toString(),
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const postInvariant = await engine.getInvariant(postR1, postR2)
    const postActualI = getInvariant(postParams)
    console.log(`
      deltaY:         ${formatEther(minDeltaY)}
      feePaid:        ${formatEther(output.feePaid)}
      postR2:         ${formatEther(postR2)}
      invariant:      ${utils.convertFromInt(invariant)}
      postInvariant:  ${utils.convertFromInt(postInvariant)}
      postActualI:    ${postActualI.toString()}
    `)
    await expect(engine.addX(deltaX, minDeltaY), 'Engine:AddX').to.emit(engine, 'AddedX')
    expect(postR1, 'check FXR1').to.be.eq((await engine.getCapital()).RX1)
    //expect(postR2, 'check FXR2').to.be.eq((await engine.getCapital()).RX2) // FIX
  })

  it('RemoveX: Swap Y to X', async function () {
    const capital = await engine.getCapital()
    const RX1 = capital.RX1
    const RX2 = capital.RX2
    const liquidity = capital.liquidity
    const invariant = await engine.invariantLast()
    const fee = await engine.FEE()
    const deltaX = parseEther('0.2')
    const params: Parameters = {
      strike: strike.toString(),
      r1: RX1,
      r2: RX2,
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const output: SwapXOutput = getDeltaY(deltaX.mul(-1).toString(), invariant.toString(), fee.toString(), params)
    const maxDeltaY = ethers.constants.MaxUint256 // FIXL output.deltaY
    const postR1 = output.FXR1
    const postR2 = output.FXR2

    const postParams: Parameters = {
      strike: strike.toString(),
      r1: postR1.toString(),
      r2: postR2.toString(),
      sigma: sigma.toString(),
      time: time.toString(),
    }
    const postInvariant = await engine.getInvariant(postR1, postR2)
    const postActualI = getInvariant(postParams)

    console.log(`
      deltaY[FIX]:    ${formatEther(maxDeltaY)}
      feePaid:        ${formatEther(output.feePaid)}
      postR2:         ${formatEther(postR2)}
      invariant:      ${utils.convertFromInt(invariant)}
      postInvariant:  ${utils.convertFromInt(postInvariant)}
      postActualI:    ${postActualI.toString()}
    `)
    await expect(engine.removeX(deltaX, maxDeltaY), 'Engine:RemoveX').to.emit(engine, 'RemovedX')
    expect(postR1, 'check FXR1').to.be.eq((await engine.getCapital()).RX1)
    //expect(postR2, 'check FXR2').to.be.eq((await engine.getCapital()).RX2) // FIX
    const FXR2 = (await engine.getCapital()).RX2
    const actualDeltaY = toBN(FXR2).sub(RX2)
    console.log(`
      actualDeltaY:   ${formatEther(actualDeltaY)}
    `)
  })
})
