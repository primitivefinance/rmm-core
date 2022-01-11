import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

async function getPositionChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  account: string,
  poolId: string
): Promise<{ balanceAfter: BigNumber; balanceBefore: BigNumber }> {
  const balanceBefore = await engine.liquidity(account, poolId)
  await transaction()
  const balanceAfter = await engine.liquidity(account, poolId)
  return { balanceAfter, balanceBefore }
}

// Chai matchers for the positions of the PrimitiveEngine

export default function supportPosition(Assertion: Chai.AssertionStatic) {
  // Liquidity methods

  Assertion.addMethod(
    'increasePositionLiquidity',
    function (this: any, engine: EngineTypes, account: string, poolId: string, liquidity: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getPositionChange(subject, engine, account, poolId)]).then(
        ([{ balanceAfter, balanceBefore }]) => {
          const expectedLiquidity = balanceBefore.add(liquidity)
          this.assert(
            balanceAfter.eq(expectedLiquidity),
            `Expected ${balanceAfter} to be ${expectedLiquidity}`,
            `Expected ${balanceAfter} NOT to be ${expectedLiquidity}`,
            expectedLiquidity,
            balanceAfter
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )

  Assertion.addMethod(
    'decreasePositionLiquidity',
    function (this: any, engine: EngineTypes, account: string, poolId: string, liquidity: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getPositionChange(subject, engine, account, poolId)]).then(
        ([{ balanceAfter, balanceBefore }]) => {
          const expectedLiquidity = balanceBefore.sub(liquidity)
          this.assert(
            balanceAfter.eq(expectedLiquidity),
            `Expected ${balanceAfter} to be ${expectedLiquidity}`,
            `Expected ${balanceAfter} NOT to be ${expectedLiquidity}`,
            expectedLiquidity,
            balanceAfter
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )
}
