import { BigNumber } from 'ethers'
import { Awaited, EngineTypes } from '../../../types'

type EngineMarginsType = Awaited<ReturnType<EngineTypes['margins']>>

async function getMarginChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  account: string
): Promise<{ after: EngineMarginsType; before: EngineMarginsType }> {
  const before = await engine.margins(account)
  await transaction()
  const after = await engine.margins(account)
  return { after, before }
}

// Chai matchers for the margins of the PrimitiveEngine

export default function supportMargin(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    'increaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delRisky: BigNumber, delStable: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getMarginChange(subject, engine, account)]).then(([{ after, before }]) => {
        const expectedRisky = before.balanceRisky.add(delRisky) // INCREASE
        const expectedStable = before.balanceStable.add(delStable) // INCREASE

        this.assert(
          before.balanceRisky.eq(expectedRisky),
          `Expected ${before.balanceRisky} to be ${expectedRisky}`,
          `Expected ${before.balanceRisky} NOT to be ${expectedRisky}`,
          expectedRisky,
          before.balanceRisky
        )

        this.assert(
          before.balanceStable.eq(expectedStable),
          `Expected ${before.balanceStable} to be ${expectedStable}`,
          `Expected ${before.balanceStable} NOT to be ${expectedStable}`,
          expectedStable,
          before.balanceStable
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )

  Assertion.addMethod(
    'decreaseMargin',
    async function (this: any, engine: EngineTypes, account: string, delRisky: BigNumber, delStable: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getMarginChange(subject, engine, account)]).then(([{ after, before }]) => {
        const expectedRisky = before.balanceRisky.sub(delRisky) // DECREASE
        const expectedStable = before.balanceStable.sub(delStable) // DECREASE

        this.assert(
          before.balanceRisky.eq(expectedRisky),
          `Expected ${before.balanceRisky} to be ${expectedRisky}`,
          `Expected ${before.balanceRisky} NOT to be ${expectedRisky}`,
          expectedRisky,
          before.balanceRisky
        )

        this.assert(
          before.balanceStable.eq(expectedStable),
          `Expected ${before.balanceStable} to be ${expectedStable}`,
          `Expected ${before.balanceStable} NOT to be ${expectedStable}`,
          expectedStable,
          before.balanceStable
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )
}
