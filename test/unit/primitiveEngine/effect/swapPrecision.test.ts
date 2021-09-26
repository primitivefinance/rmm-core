import expect from '../../../shared/expect'
import { constants, Wallet, BigNumber } from 'ethers'
import { Wei, parseWei, Time, parsePercentage } from 'web3-units'

import { MockEngine, TestRouter } from '../../../../typechain'
import { Calibration } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { PrimitiveFixture, primitiveFixture } from '../../../shared/fixtures'
import { useTokens, useApproveAll, usePool } from '../../../shared/hooks'
import { Pool } from '../../../shared'

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
  decimalsRisky: number
  decimalsStable: number
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
  decimalsRisky: 18,
  decimalsStable: 18,
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

const DEBUG = false

;[18, 8, 6].forEach((decimals) =>
  testContext(`Swapping risky in with ${decimals} decimals`, function () {
    let poolId: string, deployer: Wallet, engine: MockEngine, router: TestRouter

    beforeEach(async function () {
      const poolFixture = async ([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> => {
        let fix = await primitiveFixture([wallet], provider)
        // if using a custom engine, create it and replace the default contracts

        const { risky, stable, engine } = await fix.createEngine(decimals, decimals)

        fix.contracts.risky = risky
        fix.contracts.stable = stable
        fix.contracts.engine = engine
        await fix.contracts.router.setEngine(engine.address) // set the router's engine

        return fix
      }

      const fixture = await this.loadFixture(poolFixture)
      this.contracts = fixture.contracts
      ;[deployer, engine, router] = [this.signers[0], this.contracts.engine, this.contracts.router] // contracts
    })

    describe('swap in Risky', function () {
      let cal0: Calibration
      beforeEach(async function () {
        const maturity = swap0.t * Time.YearInSeconds
        cal0 = new Calibration(swap0.k, swap0.v, maturity, 0, swap0.s, parsePercentage(swap0.fee), decimals, decimals)
        await useTokens(deployer, this.contracts, cal0)
        await useApproveAll(deployer, this.contracts)
        ;({ poolId } = await usePool(deployer, this.contracts, cal0))
        const [resRisky, resStable] = [scaleUp(swap0.x0, cal0.decimalsRisky), scaleUp(swap0.y0, cal0.decimalsStable)]
        await engine.setReserves(poolId, resRisky.raw, resStable.raw) // set the reserves to the swap example data

        if (DEBUG)
          console.log(
            `strike: ${cal0.strike.float}, vol: ${cal0.sigma.float}, tau: ${cal0.tau.years}, spot: ${cal0.spot.float} decimals0: ${cal0.decimalsRisky}, decimals1: ${cal0.decimalsStable}`
          )
      })

      // paste `10 * normalcdlower(normalicdlower(1 - 0.408387538726) - 1)` in https://keisan.casio.com/calculator
      // to get expected stable reserve post swap
      it(`swaps in ${swap0.in0} risky and outputs ${swap0.out0} stable`, async function () {
        const deltaIn = scaleUp(swap0.in0, cal0.decimalsRisky)
        await expect(router.swap(poolId, true, deltaIn.raw, false, false, HashZero)).to.decreaseSwapOutBalance(
          engine,
          [this.contracts.risky, this.contracts.stable],
          router.address,
          poolId,
          { riskyForStable: true, deltaIn: deltaIn, fromMargin: false, toMargin: false },
          scaleUp(swap0.out0, cal0.decimalsStable)
        )

        const res = await engine.reserves(poolId)
        let { reserveRisky, reserveStable } = res
        let [risky, stable] = [scaleUp(swap0.x1, cal0.decimalsRisky), scaleUp(swap0.y1, cal0.decimalsStable)]
        const [diff0, diff1] = [
          new Wei(reserveRisky, cal0.decimalsRisky).sub(risky).float,
          new Wei(reserveStable, cal0.decimalsStable).sub(stable).float,
        ]
        const [err0, err1] = [
          calcError(risky.raw, new Wei(reserveRisky, cal0.decimalsRisky).raw),
          calcError(stable.raw, new Wei(reserveStable, cal0.decimalsStable).raw),
        ]

        if (DEBUG)
          console.log(`
        After swap:
        Risky  exp: ${swap0.x1}, act: ${new Wei(reserveRisky, cal0.decimalsRisky).float}
        Stable exp: ${swap0.y1}, act: ${new Wei(reserveStable, cal0.decimalsStable).float}
        Diff0 Err0: ${diff0} ${err0}%
        Diff1 Err1: ${diff1} ${err1}%
      `)
      })
      ;[1.1, 1.2, 2, 3, 4, 5, 7.5, 10].forEach((amountIn) =>
        it(`swaps in ${swap0.in0 * amountIn} risky if possible`, async function () {
          const [resRisky, resStable] = [scaleUp(swap0.x0, cal0.decimalsRisky), scaleUp(swap0.y0, cal0.decimalsStable)]
          const pool = new Pool(
            resRisky,
            parseWei('1'),
            cal0.strike,
            cal0.sigma,
            cal0.maturity,
            cal0.lastTimestamp,
            cal0.fee.float,
            resStable
          )

          const deltaIn = scaleUp(swap0.in0 * amountIn, cal0.decimalsRisky)
          const currentRisky = (await engine.reserves(poolId)).reserveRisky
          if (deltaIn.raw.gt(parseWei('1', cal0.decimalsRisky).sub(currentRisky).raw)) {
            await expect(router.swap(poolId, true, deltaIn.raw, false, false, HashZero)).to.be.reverted
            return
          }

          const simulated = pool.swapAmountInRisky(deltaIn)
          await expect(router.swap(poolId, true, deltaIn.raw, false, false, HashZero)).to.decreaseSwapOutBalance(
            engine,
            [this.contracts.risky, this.contracts.stable],
            router.address,
            poolId,
            { riskyForStable: true, deltaIn: deltaIn, fromMargin: false, toMargin: false },
            simulated.deltaOut
          )

          const res = await engine.reserves(poolId)
          let { reserveRisky, reserveStable } = res
          let [risky, stable] = [simulated.pool.reserveRisky, simulated.pool.reserveStable]
          const [diff0, diff1] = [
            new Wei(reserveRisky, cal0.decimalsRisky).sub(risky).float,
            new Wei(reserveStable, cal0.decimalsStable).sub(stable).float,
          ]
          const [err0, err1] = [
            calcError(risky.raw, new Wei(reserveRisky, cal0.decimalsRisky).raw),
            calcError(stable.raw, new Wei(reserveStable, cal0.decimalsStable).raw),
          ]

          if (DEBUG)
            console.log(`
        After swapping in ${deltaIn.float} risky:
        Risky  Reserve: expected: ${simulated.pool.reserveRisky.float},  actual: ${
              new Wei(reserveRisky, cal0.decimalsRisky).float
            }
        Stable Reserve: expected: ${simulated.pool.reserveStable.float}, actual: ${
              new Wei(reserveStable, cal0.decimalsStable).float
            }
        Diff0 Err0: ${diff0} ${err0}%
        Diff1 Err1: ${diff1} ${err1}%
      `)
        })
      )
    })

    describe('swap in stable', function () {
      let cal0: Calibration
      beforeEach(async function () {
        const maturity = swap0.t * Time.YearInSeconds
        cal0 = new Calibration(swap0.k, swap0.v, maturity, 0, swap0.s, parsePercentage(swap0.fee), decimals, decimals)
        await useTokens(deployer, this.contracts, cal0)
        await useApproveAll(deployer, this.contracts)
        ;({ poolId } = await usePool(deployer, this.contracts, cal0))
        const [resRisky, resStable] = [scaleUp(swap0.x0, cal0.decimalsRisky), scaleUp(swap0.y0, cal0.decimalsStable)]
        await engine.setReserves(poolId, resRisky.raw, resStable.raw) // set the reserves to the swap example data

        if (DEBUG)
          console.log(
            `strike: ${cal0.strike.float}, vol: ${cal0.sigma.float}, tau: ${cal0.tau.years}, spot: ${cal0.spot.float} decimals0: ${cal0.decimalsRisky}, decimals1: ${cal0.decimalsStable}`
          )
      })
      ;[1.1, 1.2, 2, 3, 4, 5, 7.5, 10].forEach((amountIn) =>
        it(`swaps in ${swap0.in0 * amountIn} stable if possible`, async function () {
          const [resRisky, resStable] = [scaleUp(swap0.x0, cal0.decimalsRisky), scaleUp(swap0.y0, cal0.decimalsStable)]
          const pool = new Pool(
            resRisky,
            parseWei('1'),
            cal0.strike,
            cal0.sigma,
            cal0.maturity,
            cal0.lastTimestamp,
            cal0.fee.float,
            resStable
          )

          const deltaIn = scaleUp(swap0.in0 * amountIn, cal0.decimalsStable)
          const currentStable = (await engine.reserves(poolId)).reserveStable
          if (deltaIn.raw.gt(cal0.strike.sub(currentStable).raw)) {
            console.log('this swap will revert because its too large')
            await expect(router.swap(poolId, false, deltaIn.raw, false, false, HashZero)).to.be.reverted
            return
          }

          const simulated = pool.swapAmountInStable(deltaIn)
          await expect(router.swap(poolId, false, deltaIn.raw, false, false, HashZero)).to.decreaseSwapOutBalance(
            engine,
            [this.contracts.risky, this.contracts.stable],
            router.address,
            poolId,
            { riskyForStable: false, deltaIn: deltaIn, fromMargin: false, toMargin: false },
            simulated.deltaOut
          )

          const res = await engine.reserves(poolId)
          let { reserveRisky, reserveStable } = res
          let [risky, stable] = [simulated.pool.reserveRisky, simulated.pool.reserveStable]
          const [diff0, diff1] = [
            new Wei(reserveRisky, cal0.decimalsRisky).sub(risky).float,
            new Wei(reserveStable, cal0.decimalsStable).sub(stable).float,
          ]
          const [err0, err1] = [
            calcError(risky.raw, new Wei(reserveRisky, cal0.decimalsRisky).raw),
            calcError(stable.raw, new Wei(reserveStable, cal0.decimalsStable).raw),
          ]

          if (DEBUG)
            console.log(`
        After swapping in ${deltaIn.float} risky:
        Risky  Reserve: expected: ${simulated.pool.reserveRisky.float},  actual: ${
              new Wei(reserveRisky, cal0.decimalsRisky).float
            }
        Stable Reserve: expected: ${simulated.pool.reserveStable.float}, actual: ${
              new Wei(reserveStable, cal0.decimalsStable).float
            }
        Diff0 Err0: ${diff0} ${err0}%
        Diff1 Err1: ${diff1} ${err1}%
      `)
        })
      )
    })
  })
)
