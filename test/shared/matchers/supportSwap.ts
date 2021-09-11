import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'
import { getSpotPrice } from '@primitivefinance/v2-math'
import { Wei } from 'web3-units'
import { Calibration } from '..'
import { SwapTestCase } from '../../unit/primitiveEngine/effect/swapnew.test'
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
      testCase: SwapTestCase
    ) {
      const oldMargin = await engine.margins(receiver)
      const oldBalances = await Promise.all([tokens[0].balanceOf(engine.address), tokens[1].balanceOf(engine.address)])
      const oldReserves = await engine.reserves(poolId)

      await this._obj
      const newReserves = await engine.reserves(poolId)
      const newMargin = await engine.margins(receiver)
      const newBalances = await Promise.all([tokens[0].balanceOf(engine.address), tokens[1].balanceOf(engine.address)])

      const preBalStable = testCase.toMargin ? oldMargin.balanceStable : oldBalances[1]
      const preBalRisky = testCase.toMargin ? oldMargin.balanceRisky : oldBalances[0]
      const postBalStable = testCase.toMargin ? newMargin.balanceStable : newBalances[1]
      const postBalRisky = testCase.toMargin ? newMargin.balanceRisky : newBalances[0]

      let balanceOut = testCase.riskyForStable ? preBalStable.sub(postBalStable) : preBalRisky.sub(postBalRisky)
      if (testCase.toMargin) balanceOut = balanceOut.mul(-1)

      const deltaOut = testCase.riskyForStable
        ? oldReserves.reserveStable.sub(newReserves.reserveStable)
        : oldReserves.reserveRisky.sub(newReserves.reserveRisky)

      function bnToNumber(bn: BigNumber): number | string {
        return new Wei(bn).toString()
      }

      console.log(bnToNumber(oldReserves.reserveRisky), bnToNumber(oldReserves.reserveStable))
      console.log(bnToNumber(newReserves.reserveRisky), bnToNumber(newReserves.reserveStable))
      this.assert(
        balanceOut.eq(deltaOut),
        `Expected ${balanceOut} to be ${deltaOut}`,
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
