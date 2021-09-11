import expect from '../../../shared/expect'
import { constants, Wallet, BigNumber } from 'ethers'
import { Wei, parseWei, Time, parsePercentage } from 'web3-units'

import { MockEngine, TestRouter } from '../../../../typechain'
import { Calibration } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { primitiveFixture } from '../../../shared/fixtures'
import { useTokens, useApproveAll, usePool } from '../../../shared/hooks'

const { HashZero } = constants

interface SpecificSwap {
  k: number
  v: number
  t: number
  s: number
  x0: number
  y0: number
  in0: number
  fee: number
  x1: number
  y1: number
  out0: number
  precision?: number
}

const swap0: SpecificSwap = {
  k: 10,
  v: 1,
  t: 1,
  s: 10,
  x0: 0.308537538726,
  y0: 3.08537538726,
  in0: 0.1,
  fee: 0.0015,
  x1: 0.408537538726,
  y1: 2.21038261359,
  out0: 0.873845983593,
  precision: 0.8738459835929198048536,
}

function scaleUp(value: number, decimals: number): Wei {
  const scaled = Math.floor(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
  return parseWei(scaled, decimals)
}

function flo(val: BigNumber): number {
  return new Wei(val).float
}

function calcError(expected: BigNumber, actual: BigNumber): number {
  const percent = actual.sub(expected).mul(100)
  return flo(percent.mul(parseWei('1').raw).div(expected))
}

testContext(`Swapping high resolution`, function () {
  let poolId: string, deployer: Wallet, engine: MockEngine, router: TestRouter

  beforeEach(async function () {
    const fixture = await this.loadFixture(primitiveFixture)
    this.contracts = fixture.contracts
    ;[deployer, engine, router] = [this.signers[0], this.contracts.engine, this.contracts.router] // contracts
  })

  describe('risky in swaps', function () {
    beforeEach(async function () {
      const maturity = swap0.t * Time.YearInSeconds
      const cal0 = new Calibration(swap0.k, swap0.v, maturity, 0, swap0.s, parsePercentage(swap0.fee))
      await useTokens(deployer, this.contracts, cal0)
      await useApproveAll(deployer, this.contracts)
      ;({ poolId } = await usePool(deployer, this.contracts, cal0))
      const [resRisky, resStable] = [scaleUp(swap0.x0, 18), scaleUp(swap0.y0, 18)]
      await engine.setReserves(poolId, resRisky.raw, resStable.raw)
      const res = await engine.reserves(poolId)
      const { reserveRisky, reserveStable } = res

      console.log(`
        Set reserves:
        Risky  exp: ${swap0.x0}, act: ${flo(reserveRisky)}
        Stable exp: ${swap0.y0}, act: ${flo(reserveStable)}
        `)
    })

    // paste `10 * normalcdlower(normalicdlower(1 - 0.408387538726) - 1)` in https://keisan.casio.com/calculator
    // to get expected stable reserve post swap
    it(`swaps in ${swap0.in0} risky and outputs ${swap0.out0} stable`, async function () {
      const deltaIn = scaleUp(swap0.in0, 18)
      await expect(router.swap(poolId, true, deltaIn.raw, false, false, HashZero)).to.decreaseSwapOutBalance(
        engine,
        [this.contracts.risky, this.contracts.stable],
        router.address,
        poolId,
        { riskyForStable: true, deltaIn: deltaIn, fromMargin: false, toMargin: false },
        scaleUp(swap0.out0, 18)
      )

      const res = await engine.reserves(poolId)
      let { reserveRisky, reserveStable } = res
      let [risky, stable] = [scaleUp(swap0.x1, 18), scaleUp(swap0.y1, 18)]
      const [diff0, diff1] = [new Wei(reserveRisky).sub(risky).float, new Wei(reserveStable).sub(stable).float]
      const [err0, err1] = [calcError(risky.raw, reserveRisky), calcError(stable.raw, reserveStable)]

      console.log(`
        After swap:
        Risky  exp: ${swap0.x1}, act: ${flo(reserveRisky)}
        Stable exp: ${swap0.y1}, act: ${flo(reserveStable)}
        Diff0 Err0: ${diff0} ${err0}%
        Diff1 Err1: ${diff1} ${err1}%
      `)
    })
  })
})
