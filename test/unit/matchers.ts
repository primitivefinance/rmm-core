import { BigNumber } from 'ethers'
import { PrimitiveEngine } from '../../typechain'

function supportFoo(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod('foo', function (this: any) {
    const subject = this._obj

    this.assert(
      subject == 'foo',
      `Expected ${subject} to be foo`,
      `Expected ${subject} not to be foo`,
      'Proper foo is foo',
      subject
    )
  })
}

function supportMargin(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    'increaseMargin',
    async function (this: any, engine: PrimitiveEngine, owner: string, risky: BigNumber, stable: BigNumber) {
      const oldMargin = await engine.margins(owner)
      await this._obj
      const newMargin = await engine.margins(owner)

      const expectedRisky = oldMargin.balanceRisky.add(risky)
      const expectedStable = oldMargin.balanceStable.add(stable)

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
    async function (this: any, engine: PrimitiveEngine, owner: string, risky: BigNumber, stable: BigNumber) {
      const oldMargin = await engine.margins(owner)
      await this._obj
      const newMargin = await engine.margins(owner)

      const expectedRisky = oldMargin.balanceRisky.sub(risky)
      const expectedStable = oldMargin.balanceStable.sub(stable)

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

export function primitiveChai(chai: Chai.ChaiStatic) {
  supportFoo(chai.Assertion)
  supportMargin(chai.Assertion)
}
