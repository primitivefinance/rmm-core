import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

// Chai matchers for the reserves of the PrimitiveEngine

export default function supportReserve(Assertion: Chai.AssertionStatic) {
  // Reserve Risky

  Assertion.addMethod(
    'increaseReserveRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedReserveRisky = oldReserve.reserveRisky.add(amount)
      this.assert(
        newReserve.reserveRisky.eq(expectedReserveRisky) || newReserve.reserveRisky.sub(expectedReserveRisky).lt(1000),
        `Expected ${expectedReserveRisky} to be ${newReserve.reserveRisky}`,
        `Expected ${expectedReserveRisky} NOT to be ${newReserve.reserveRisky}`,
        expectedReserveRisky,
        newReserve.reserveRisky
      )
    }
  )

  Assertion.addMethod(
    'decreaseReserveRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedReserveRisky = oldReserve.reserveRisky.sub(amount)

      this.assert(
        newReserve.reserveRisky.eq(expectedReserveRisky),
        `Expected ${expectedReserveRisky} to be ${newReserve.reserveRisky}`,
        `Expected ${expectedReserveRisky} NOT to be ${newReserve.reserveRisky}`,
        expectedReserveRisky,
        newReserve.reserveRisky
      )
    }
  )

  // Reserve Stable

  Assertion.addMethod(
    'increaseReserveStable',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedReserveStable = oldReserve.reserveStable.add(amount)

      this.assert(
        newReserve.reserveStable.eq(expectedReserveStable) ||
          newReserve.reserveStable.sub(expectedReserveStable).lt(1000),
        `Expected ${expectedReserveStable} to be ${newReserve.reserveStable}`,
        `Expected ${expectedReserveStable} NOT to be ${newReserve.reserveStable}`,
        expectedReserveStable,
        newReserve.reserveStable
      )
    }
  )

  Assertion.addMethod(
    'decreaseReserveStable',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedReserveStable = oldReserve.reserveStable.sub(amount)

      this.assert(
        newReserve.reserveStable.eq(expectedReserveStable),
        `Expected ${expectedReserveStable} to be ${newReserve.reserveStable}`,
        `Expected ${expectedReserveStable} NOT to be ${newReserve.reserveStable}`,
        expectedReserveStable,
        newReserve.reserveStable
      )
    }
  )

  // Liquidity

  Assertion.addMethod(
    'increaseReserveLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedLiquidity = oldReserve.liquidity.add(amount)

      this.assert(
        newReserve.liquidity.eq(expectedLiquidity),
        `Expected ${expectedLiquidity} to be ${newReserve.liquidity}`,
        `Expected ${expectedLiquidity} NOT to be ${newReserve.liquidity}`,
        expectedLiquidity,
        newReserve.liquidity
      )
    }
  )

  Assertion.addMethod(
    'decreaseReserveLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedLiquidity = oldReserve.liquidity.sub(amount)

      this.assert(
        newReserve.liquidity.eq(expectedLiquidity),
        `Expected ${expectedLiquidity} to be ${newReserve.liquidity}`,
        `Expected ${expectedLiquidity} NOT to be ${newReserve.liquidity}`,
        expectedLiquidity,
        newReserve.liquidity
      )
    }
  )

  // BlockTimestamp

  Assertion.addMethod(
    'updateReserveBlockTimestamp',
    async function (this: any, engine: EngineTypes, poolId: string, blockTimestamp: number) {
      await this._obj
      const newReserve = await engine.reserves(poolId)

      this.assert(
        newReserve.blockTimestamp == blockTimestamp,
        `Expected ${blockTimestamp} to be ${newReserve.blockTimestamp}`,
        `Expected ${blockTimestamp} NOT to be ${newReserve.blockTimestamp}`,
        blockTimestamp,
        newReserve.blockTimestamp
      )
    }
  )

  // Cumulative Risky

  Assertion.addMethod(
    'updateReserveCumulativeRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const deltaTime = blockTimestamp - oldReserve.blockTimestamp
      const expectedCumulativeRisky = oldReserve.cumulativeRisky.add(newReserve.reserveRisky.mul(deltaTime))

      this.assert(
        newReserve.cumulativeRisky.eq(expectedCumulativeRisky),
        `Expected ${expectedCumulativeRisky} to be ${newReserve.cumulativeRisky}`,
        `Expected ${expectedCumulativeRisky} NOT to be ${newReserve.cumulativeRisky}`,
        expectedCumulativeRisky,
        newReserve.cumulativeRisky
      )
    }
  )

  // Cumulative Stable

  Assertion.addMethod(
    'updateReserveCumulativeStable',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const deltaTime = blockTimestamp - oldReserve.blockTimestamp
      const expectedCumulativeStable = oldReserve.cumulativeStable.add(newReserve.reserveRisky.mul(deltaTime))

      this.assert(
        newReserve.cumulativeStable.eq(expectedCumulativeStable),
        `Expected ${expectedCumulativeStable} to be ${newReserve.cumulativeStable}`,
        `Expected ${expectedCumulativeStable} NOT to be ${newReserve.cumulativeStable}`,
        expectedCumulativeStable,
        newReserve.cumulativeStable
      )
    }
  )

  // Cumulative Liquidity

  Assertion.addMethod(
    'updateReserveCumulativeLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const deltaTime = blockTimestamp - oldReserve.blockTimestamp
      const expectedCumulativeLiquidity = oldReserve.cumulativeLiquidity.add(newReserve.liquidity.mul(deltaTime))

      this.assert(
        newReserve.cumulativeLiquidity.eq(expectedCumulativeLiquidity),
        `Expected ${expectedCumulativeLiquidity} to be ${newReserve.cumulativeLiquidity}`,
        `Expected ${expectedCumulativeLiquidity} NOT to be ${newReserve.cumulativeLiquidity}`,
        expectedCumulativeLiquidity,
        newReserve.cumulativeLiquidity
      )
    }
  )
}
