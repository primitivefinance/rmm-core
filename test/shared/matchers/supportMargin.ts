import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

// Chai matchers for the margins of the PrimitiveEngine

export default function supportMargin(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    'increaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delRisky: BigNumber, delStable: BigNumber) {
      const oldMargin = await engine.margins(account)
      await this._obj
      const newMargin = await engine.margins(account)

      const expectedRisky = oldMargin.balanceRisky.add(delRisky)
      const expectedStable = oldMargin.balanceStable.add(delStable)

      this.assert(
        newMargin.balanceRisky.eq(expectedRisky),
        `Expected ${newMargin.balanceRisky} to be ${expectedRisky}`,
        `Expected ${newMargin.balanceRisky} NOT to be ${expectedRisky}`,
        expectedRisky,
        newMargin.balanceRisky
      )

      this.assert(
        newMargin.balanceStable.eq(expectedStable),
        `Expected ${newMargin.balanceStable} to be ${expectedStable}`,
        `Expected ${newMargin.balanceStable} NOT to be ${expectedStable}`,
        expectedStable,
        newMargin.balanceStable
      )
    }
  )

  Assertion.addMethod(
    'decreaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delRisky: BigNumber, delStable: BigNumber) {
      const oldMargin = await engine.margins(account)
      await this._obj
      const newMargin = await engine.margins(account)

      const expectedRisky = oldMargin.balanceRisky.sub(delRisky)
      const expectedStable = oldMargin.balanceStable.sub(delStable)

      this.assert(
        newMargin.balanceRisky.eq(expectedRisky),
        `Expected ${newMargin.balanceRisky} to be ${expectedRisky}`,
        `Expected ${newMargin.balanceRisky} NOT to be ${expectedRisky}`,
        expectedRisky,
        newMargin.balanceRisky
      )

      this.assert(
        newMargin.balanceStable.eq(expectedStable),
        `Expected ${newMargin.balanceStable} to be ${expectedStable}`,
        `Expected ${newMargin.balanceStable} NOT to be ${expectedStable}`,
        expectedStable,
        newMargin.balanceStable
      )
    }
  )
}
