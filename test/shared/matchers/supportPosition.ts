import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

async function getPositionChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  account: string,
  poolId: string
): Promise<{ after: BigNumber; before: BigNumber }> {
  const before = await engine.liquidity(account, poolId)
  await transaction()
  const after = await engine.liquidity(account, poolId)
  return { after, before }
}

// Chai matchers for the positions of the PrimitiveEngine

export default function supportPosition(Assertion: Chai.AssertionStatic) {
  // Liquidity methods

  Assertion.addMethod(
    'increasePositionLiquidity',
    function (this: any, engine: EngineTypes, account: string, poolId: string, liquidity: BigNumber) {
      const subject = this._obj

      const derivedPromise = Promise.all([getPositionChange(subject, engine, account, poolId)]).then(
        ([{ after, before }]) => {
          const expectedLiquidity = before.add(liquidity)
          this.assert(
            after.eq(expectedLiquidity),
            `Expected ${after} to be ${expectedLiquidity}`,
            `Expected ${after} NOT to be ${expectedLiquidity}`,
            expectedLiquidity,
            after
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
        ([{ after, before }]) => {
          const expectedLiquidity = before.sub(liquidity)
          this.assert(
            after.eq(expectedLiquidity),
            `Expected ${after} to be ${expectedLiquidity}`,
            `Expected ${after} NOT to be ${expectedLiquidity}`,
            expectedLiquidity,
            after
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
