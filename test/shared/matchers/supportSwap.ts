import { BigNumber } from 'ethers'
import { getSpotPriceApproximation } from '@primitivefi/rmm-math'
import { parseWei, Wei } from 'web3-units'

import { EngineTypes } from '../../../types'
import { Calibration } from '../calibration'
import { EngineMarginsType } from './supportMargin'
import { EngineReservesType } from './supportReserve'
// Chai matchers for the positions of the PrimitiveEngine

async function getInvariantChange(transaction: () => Promise<void> | void, engine: EngineTypes, poolId: string) {
  const before = await engine.invariantOf(poolId)
  await transaction()
  const after = await engine.invariantOf(poolId)
  return { after, before }
}

async function getSwapChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  tokens: any[],
  receiver: string,
  poolId: string
): Promise<{
  after: { margin: EngineMarginsType; tokens: any; reserve: EngineReservesType }
  before: { margin: EngineMarginsType; tokens: any; reserve: EngineReservesType }
}> {
  const beforeMargin = await engine.margins(receiver)
  const beforeReserve = await engine.reserves(poolId)
  const beforeTokens = [await tokens[0].balanceOf(engine.address), await tokens[1].balanceOf(engine.address)]
  const before = { margin: beforeMargin, tokens: beforeTokens, reserve: beforeReserve }
  await transaction()
  const afterMargin = await engine.margins(receiver)
  const afterReserve = await engine.reserves(poolId)
  const afterTokens = [await tokens[0].balanceOf(engine.address), await tokens[1].balanceOf(engine.address)]
  const after = { margin: afterMargin, tokens: afterTokens, reserve: afterReserve }
  return { after, before }
}

async function getSpotPriceChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  poolId: string
): Promise<{ after: EngineReservesType; before: EngineReservesType }> {
  const before = await engine.reserves(poolId)
  await transaction()
  const after = await engine.reserves(poolId)
  return { after, before }
}

export default function supportSwap(Assertion: Chai.AssertionStatic) {
  // Liquidity methods

  Assertion.addMethod(
    'updateSpotPrice',
    async function (this: any, engine: EngineTypes, cal: Calibration, riskyForStable: boolean) {
      const subject = this._obj
      const poolId = cal.poolId(engine.address)
      const derivedPromise = Promise.all([getSpotPriceChange(subject, engine, poolId)]).then(([{ after, before }]) => {
        const { strike, sigma, tau, decimalsRisky, decimalsStable } = cal

        function reservePerLiquidity(reserve, decimals, liquidity): number {
          const perLP = new Wei(reserve, decimals)
          const totalLP = new Wei(liquidity, 18)
          return perLP.float / totalLP.float
        }

        let { reserveRisky, liquidity } = before
        const preSpot = getSpotPriceApproximation(
          reservePerLiquidity(reserveRisky, decimalsRisky, liquidity),
          strike.float,
          sigma.float,
          tau.years
        )

        ;({ reserveRisky, liquidity } = after)
        const postSpot = getSpotPriceApproximation(
          reservePerLiquidity(reserveRisky, decimalsRisky, liquidity),
          strike.float,
          sigma.float,
          tau.years
        )

        const condition = riskyForStable ? preSpot >= postSpot : postSpot >= preSpot

        this.assert(
          condition,
          `Expected ${riskyForStable ? preSpot : postSpot} to be gte ${riskyForStable ? postSpot : preSpot}`,
          `Expected ${riskyForStable ? preSpot : postSpot} NOT to be lt ${riskyForStable ? postSpot : preSpot}`,
          preSpot,
          postSpot
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )

  Assertion.addMethod(
    'decreaseSwapOutBalance',
    async function (
      this: any,
      engine: EngineTypes,
      tokens: any[],
      receiver: string,
      poolId: string,
      { riskyForStable, toMargin }: { riskyForStable: boolean; toMargin: boolean },
      amountOut?: Wei
    ) {
      const subject = this._obj
      const derivedPromise = Promise.all([getSwapChange(subject, engine, tokens, receiver, poolId)]).then(
        ([{ after, before }]) => {
          const preBalStable = toMargin ? before.margin.balanceStable : before.tokens[1]
          const preBalRisky = toMargin ? before.margin.balanceRisky : before.tokens[0]
          const postBalStable = toMargin ? after.margin.balanceStable : after.tokens[1]
          const postBalRisky = toMargin ? after.margin.balanceRisky : after.tokens[0]

          let balanceOut = riskyForStable ? preBalStable.sub(postBalStable) : preBalRisky.sub(postBalRisky)
          if (toMargin) balanceOut = balanceOut.mul(-1)

          const deltaOut = amountOut
            ? amountOut.raw
            : riskyForStable
            ? before.reserve.reserveStable.sub(after.reserve.reserveStable)
            : before.reserve.reserveRisky.sub(after.reserve.reserveRisky)

          function flo(val: BigNumber): number {
            return new Wei(val).float
          }

          function calcError(expected: BigNumber, actual: BigNumber, decimals: number): number {
            const percent = actual.sub(expected).mul(100)
            if (expected.isZero()) return 0
            return flo(percent.mul(parseWei('1', decimals).raw).div(expected))
          }

          const outDecimals = amountOut ? amountOut.decimals : 18

          const maxError = 1 // point
          const isValid =
            calcError(new Wei(balanceOut, outDecimals).raw, deltaOut, outDecimals) <= maxError ? true : false

          this.assert(
            isValid,
            `Expected ${flo(balanceOut)} to be ${flo(deltaOut)}, but has ${flo(
              deltaOut.sub(balanceOut)
            )} difference with error of: ${calcError(new Wei(balanceOut, outDecimals).raw, deltaOut, outDecimals)}%`,
            `Expected ${balanceOut} NOT to be ${deltaOut}`,
            deltaOut,
            balanceOut
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )

  Assertion.addMethod('increaseInvariant', async function (this: any, engine: EngineTypes, poolId: string) {
    const subject = this._obj
    const derivedPromise = Promise.all([getInvariantChange(subject, engine, poolId)]).then(([{ after, before }]) => {
      this.assert(
        after.gte(before),
        `Expected ${after} to be gte ${before}`,
        `Expected ${after} NOT to be gte ${before}`,
        before,
        after
      )
    })

    this.then = derivedPromise.then.bind(derivedPromise)
    this.catch = derivedPromise.catch.bind(derivedPromise)
    this.promise = derivedPromise
    return this
  })
}
