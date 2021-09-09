import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

// Chai matchers for the positions of the PrimitiveEngine

export default function supportPosition(Assertion: Chai.AssertionStatic) {
  // Liquidity methods

  Assertion.addMethod(
    'increasePositionLiquidity',
    async function (this: any, engine: EngineTypes, account: string, poolId: string, liquidity: BigNumber) {
      const oldPosition = await engine.liquidity(account, poolId)
      await this._obj
      const newPosition = await engine.liquidity(account, poolId)

      const expectedLiquidity = oldPosition.add(liquidity)

      this.assert(
        newPosition.eq(expectedLiquidity),
        `Expected ${newPosition} to be ${expectedLiquidity}`,
        `Expected ${newPosition} NOT to be ${expectedLiquidity}`,
        expectedLiquidity,
        newPosition
      )
    }
  )

  Assertion.addMethod(
    'decreasePositionLiquidity',
    async function (this: any, engine: EngineTypes, account: string, poolId: string, liquidity: BigNumber) {
      const oldPosition = await engine.liquidity(account, poolId)
      await this._obj
      const newPosition = await engine.liquidity(account, poolId)

      const expectedLiquidity = oldPosition.sub(liquidity)

      this.assert(
        newPosition.eq(expectedLiquidity),
        `Expected ${newPosition} to be ${expectedLiquidity}`,
        `Expected ${newPosition} NOT to be ${expectedLiquidity}`,
        expectedLiquidity,
        newPosition
      )
    }
  )
}
