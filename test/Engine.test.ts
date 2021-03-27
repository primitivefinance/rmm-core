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
const PERCENTAGE = 1000

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
  const input = (1 / phi) * (1 - reserve) - vol / PERCENTAGE
  const r2 = K * utils.std_n_cdf(input)
  return r2
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
  const k = toBN(params.r2).sub(
    parseEther(
      getTradingFunction(
        params.r1.toString(),
        params.strike.toString(),
        params.sigma.toString(),
        params.time.toString()
      ).toString()
    )
  )
  return weiToNumber(k.toString())
}

describe('Primitive Engine', function () {
  let fixture: EngineFixture
  let r1: BigNumberish, r2: BigNumberish, strike: BigNumberish, sigma: BigNumberish, time: BigNumberish
  let engine: Contract
  let [signer] = waffle.provider.getWallets()
  const loadFixture = createFixtureLoader([signer], waffle.provider)

  beforeEach(async function () {
    fixture = await loadFixture(engineFixture)
    engine = fixture.engine
    r1 = parseEther('1')
    r2 = parseEther('100')
    strike = parseEther('25')
    sigma = 0.1 * PERCENTAGE
    time = 31449600 //one year
    await engine.initialize(strike, sigma, time)
    await engine.addBoth(r1, r2)
  })

  function percentage(val: string, percentage: number, add: boolean): number {
    val = parseEther(val).toString()
    return weiToNumber(
      toBN(val)
        .mul(add ? 100 + percentage : 100 - percentage)
        .div(100)
        .toString()
    )
  }

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
    const rawVol = toBN(await engine.proportionalVol()).mul(PERCENTAGE)
    const vol = utils.convertFromPercentageInt((await engine.proportionalVol()).toString())
    const actual = getProportionalVol(sigma.toString(), time.toString())
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
      r1: r1.toString(),
      r2: r2.toString(),
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
    const deltaX = parseEther('2')
    const deltaY = parseEther('1')
    const postR1 = deltaX.add(await engine.r1())
    const postR2 = deltaY.add(await engine.r2())
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
    await expect(engine.addBoth(deltaX, deltaY)).to.emit(engine, 'AddedBoth')
  })

  it('Remove both X and Y', async function () {
    const invariant = await engine.invariantLast()
    const liquidity = await engine.liquidity()
    const deltaL = toBN(liquidity).sub(await engine.INIT_SUPPLY())
    const deltaX = toBN(1)
      .sub(toBN(liquidity).sub(deltaL).div(liquidity))
      .mul(await engine.r1())
    const deltaY = toBN(1)
      .sub(toBN(liquidity).sub(deltaL).div(liquidity))
      .mul(await engine.r2())
    const postR1 = deltaX.add(await engine.r1())
    const postR2 = deltaY.add(await engine.r2())
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
    await expect(engine.removeBoth(deltaY)).to.emit(engine, 'RemovedBoth')
  })
})
