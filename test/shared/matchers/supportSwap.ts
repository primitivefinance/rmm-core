import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'
import { getSpotPrice } from '@primitivefi/rmm-math'
import { parseWei, Wei } from 'web3-units'
import { Calibration } from '..'
import { SwapTestCase } from '../../unit/primitiveEngine/effect/swap.test'
// Chai matchers for the positions of the PrimitiveEngine

export default function supportSwap(Assertion: Chai.AssertionStatic) {
  // Liquidity methods

  Assertion.addMethod(
    'updateSpotPrice',
    async function (this: any, engine: EngineTypes, cal: Calibration, riskyForStable: boolean) {
      const { strike, sigma, tau, decimalsRisky, decimalsStable } = cal
      const poolId = cal.poolId(engine.address)
      const oldReserves = await engine.reserves(poolId)
      await this._obj
      const newReserves = await engine.reserves(poolId)

      function reservePerLiquidity(reserve, decimals, liquidity): number {
        const perLP = new Wei(reserve, decimals)
        const totalLP = new Wei(liquidity, 18)
        return perLP.float / totalLP.float
      }

      let { reserveRisky, liquidity } = oldReserves
      const preSpot = getSpotPrice(
        reservePerLiquidity(reserveRisky, decimalsRisky, liquidity),
        strike.float,
        sigma.float,
        tau.years
      )

      ;({ reserveRisky, liquidity } = newReserves)
      const postSpot = getSpotPrice(
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
      const oldMargin = await engine.margins(receiver)
      const oldBalances = [await tokens[0].balanceOf(engine.address), await tokens[1].balanceOf(engine.address)]
      const oldReserves = await engine.reserves(poolId)

      await this._obj
      const newReserves = await engine.reserves(poolId)
      const newMargin = await engine.margins(receiver)
      const newBalances = [await tokens[0].balanceOf(engine.address), await tokens[1].balanceOf(engine.address)]

      const preBalStable = toMargin ? oldMargin.balanceStable : oldBalances[1]
      const preBalRisky = toMargin ? oldMargin.balanceRisky : oldBalances[0]
      const postBalStable = toMargin ? newMargin.balanceStable : newBalances[1]
      const postBalRisky = toMargin ? newMargin.balanceRisky : newBalances[0]

      let balanceOut = riskyForStable ? preBalStable.sub(postBalStable) : preBalRisky.sub(postBalRisky)
      if (toMargin) balanceOut = balanceOut.mul(-1)

      const deltaOut = amountOut
        ? amountOut.raw
        : riskyForStable
        ? oldReserves.reserveStable.sub(newReserves.reserveStable)
        : oldReserves.reserveRisky.sub(newReserves.reserveRisky)

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
      const isValid = calcError(new Wei(balanceOut, outDecimals).raw, deltaOut, outDecimals) <= maxError ? true : false

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

  Assertion.addMethod('increaseInvariant', async function (this: any, engine: EngineTypes, poolId: string) {
    const oldInvariant = await engine.invariantOf(poolId)
    await this._obj
    const newInvariant = await engine.invariantOf(poolId)

    this.assert(
      newInvariant.gte(oldInvariant),
      `Expected ${newInvariant} to be gte ${oldInvariant}`,
      `Expected ${newInvariant} NOT to be lt ${oldInvariant}`,
      oldInvariant,
      newInvariant
    )
  })
}
