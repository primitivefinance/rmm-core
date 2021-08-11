import { BigNumber } from 'ethers'
import { PrimitiveEngine } from '../../../typechain'

// Chai matchers for the positions of the PrimitiveEngine

export default function supportPosition(Assertion: Chai.AssertionStatic) {
  // Float methods

  Assertion.addMethod(
    'increasePositionFloat',
    async function (this: any, engine: PrimitiveEngine, posId: string, float: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedFloat = oldPosition.float.add(float)

      this.assert(
        newPosition.float.eq(expectedFloat),
        `Expected ${newPosition.float} to be ${expectedFloat}`,
        `Expected ${newPosition.float} NOT to be ${expectedFloat}`,
        expectedFloat,
        newPosition.float
      )
    }
  )

  Assertion.addMethod(
    'decreasePositionFloat',
    async function (this: any, engine: PrimitiveEngine, posId: string, float: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedFloat = oldPosition.float.sub(float)

      this.assert(
        newPosition.float.eq(expectedFloat),
        `Expected ${newPosition.float} to be ${expectedFloat}`,
        `Expected ${newPosition.float} NOT to be ${expectedFloat}`,
        expectedFloat,
        newPosition.float
      )
    }
  )

  // Liquidity methods

  Assertion.addMethod(
    'increasePositionLiquidity',
    async function (this: any, engine: PrimitiveEngine, posId: string, liquidity: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedLiquidity = oldPosition.liquidity.add(liquidity)

      this.assert(
        newPosition.liquidity.eq(expectedLiquidity),
        `Expected ${newPosition.liquidity} to be ${expectedLiquidity}`,
        `Expected ${newPosition.liquidity} NOT to be ${expectedLiquidity}`,
        expectedLiquidity,
        newPosition.liquidity
      )
    }
  )

  Assertion.addMethod(
    'decreasePositionLiquidity',
    async function (this: any, engine: PrimitiveEngine, posId: string, liquidity: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedLiquidity = oldPosition.liquidity.sub(liquidity)

      this.assert(
        newPosition.liquidity.eq(expectedLiquidity),
        `Expected ${newPosition.liquidity} to be ${expectedLiquidity}`,
        `Expected ${newPosition.liquidity} NOT to be ${expectedLiquidity}`,
        expectedLiquidity,
        newPosition.liquidity
      )
    }
  )

  // Debt methods

  Assertion.addMethod(
    'increasePositionDebt',
    async function (this: any, engine: PrimitiveEngine, posId: string, debt: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedDebt = oldPosition.debt.add(debt)

      this.assert(
        newPosition.debt.eq(expectedDebt),
        `Expected ${newPosition.debt} to be ${expectedDebt}`,
        `Expected ${newPosition.debt} NOT to be ${expectedDebt}`,
        expectedDebt,
        newPosition.debt
      )
    }
  )

  Assertion.addMethod(
    'decreasePositionDebt',
    async function (this: any, engine: PrimitiveEngine, posId: string, debt: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedDebt = oldPosition.debt.sub(debt)

      this.assert(
        newPosition.debt.eq(expectedDebt),
        `Expected ${newPosition.debt} to be ${expectedDebt}`,
        `Expected ${newPosition.debt} NOT to be ${expectedDebt}`,
        expectedDebt,
        newPosition.debt
      )
    }
  )
}
