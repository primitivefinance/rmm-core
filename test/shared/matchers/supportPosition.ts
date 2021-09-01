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
    async function (
      this: any,
      engine: PrimitiveEngine,
      posId: string,
      riskyCollateral: BigNumber,
      stableCollateral: BigNumber
    ) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedRiskyCollateral = oldPosition.riskyCollateral.add(riskyCollateral)
      const expectedStableCollateral = oldPosition.stableCollateral.add(stableCollateral)

      this.assert(
        newPosition.riskyCollateral.eq(expectedRiskyCollateral),
        `Expected ${newPosition.riskyCollateral} to be ${expectedRiskyCollateral}`,
        `Expected ${newPosition.riskyCollateral} NOT to be ${expectedRiskyCollateral}`,
        expectedRiskyCollateral,
        newPosition.riskyCollateral
      )
      this.assert(
        newPosition.stableCollateral.eq(expectedStableCollateral),
        `Expected ${newPosition.stableCollateral} to be ${expectedStableCollateral}`,
        `Expected ${newPosition.stableCollateral} NOT to be ${expectedStableCollateral}`,
        expectedStableCollateral,
        newPosition.stableCollateral
      )
    }
  )

  Assertion.addMethod(
    'decreasePositionDebt',
    async function (
      this: any,
      engine: PrimitiveEngine,
      posId: string,
      riskyCollateral: BigNumber,
      stableCollateral: BigNumber
    ) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedRiskyCollateral = oldPosition.riskyCollateral.sub(riskyCollateral)
      const expectedStableCollateral = oldPosition.stableCollateral.sub(stableCollateral)

      this.assert(
        newPosition.riskyCollateral.eq(expectedRiskyCollateral),
        `Expected ${newPosition.riskyCollateral} to be ${expectedRiskyCollateral}`,
        `Expected ${newPosition.riskyCollateral} NOT to be ${expectedRiskyCollateral}`,
        expectedRiskyCollateral,
        newPosition.riskyCollateral
      )
      this.assert(
        newPosition.stableCollateral.eq(expectedStableCollateral),
        `Expected ${newPosition.stableCollateral} to be ${expectedStableCollateral}`,
        `Expected ${newPosition.stableCollateral} NOT to be ${expectedStableCollateral}`,
        expectedStableCollateral,
        newPosition.stableCollateral
      )
    }
  )

  Assertion.addMethod(
    'increasePositionFeeRiskyGrowthLast',
    async function (this: any, engine: PrimitiveEngine, posId: string, amount: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedGrowth = oldPosition.feeRiskyGrowthLast.add(amount)

      this.assert(
        newPosition.feeRiskyGrowthLast.eq(expectedGrowth),
        `Expected ${expectedGrowth} to be ${newPosition.feeRiskyGrowthLast}`,
        `Expected ${expectedGrowth} NOT to be ${newPosition.feeRiskyGrowthLast}`,
        expectedGrowth,
        newPosition.feeRiskyGrowthLast
      )
    }
  )

  Assertion.addMethod(
    'increasePositionFeeStableGrowthLast',
    async function (this: any, engine: PrimitiveEngine, posId: string, amount: BigNumber) {
      const oldPosition = await engine.positions(posId)
      await this._obj
      const newPosition = await engine.positions(posId)

      const expectedGrowth = oldPosition.feeStableGrowthLast.add(amount)

      this.assert(
        newPosition.feeStableGrowthLast.eq(expectedGrowth),
        `Expected ${expectedGrowth} to be ${newPosition.feeStableGrowthLast}`,
        `Expected ${expectedGrowth} NOT to be ${newPosition.feeStableGrowthLast}`,
        expectedGrowth,
        newPosition.feeStableGrowthLast
      )
    }
  )
}
