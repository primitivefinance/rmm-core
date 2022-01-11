import { BigNumber } from 'ethers'
import { EngineTypes } from '../../../types'

type Awaited<T> = T extends PromiseLike<infer U> ? U : T
type EngineReservesType = Awaited<ReturnType<EngineTypes['reserves']>>

async function getReserveChange(
  transaction: () => Promise<void> | void,
  engine: EngineTypes,
  poolId: string
): Promise<{ after: EngineReservesType; before: EngineReservesType }> {
  const before = await engine.reserves(poolId)
  await transaction()
  const after = await engine.reserves(poolId)
  return { after, before }
}

// Chai matchers for the reserves of the PrimitiveEngine

export default function supportReserve(Assertion: Chai.AssertionStatic) {
  // Reserve Risky

  Assertion.addMethod(
    'increaseReserveRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const subject = this._obj

      // the argument object is a little complicated so here's whats happening:
      // Promise.all returns array of the fn results, so we get the result with [result]
      // destructure the result into the two items in the object, after and before: [{after, before}]
      // since these are the reserves object, need to destrcture the specific value we want:
      // [{ after: reserveRisky }, before: { reserveRisky: before }]
      // finally, redefine those reserve values as before and after, so its easier to do the assertion
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { reserveRisky: after },
            before: { reserveRisky: before },
          },
        ]) => {
          const expected = before.add(amount) // INCREASE
          this.assert(
            after.eq(expected) || after.sub(expected).lt(1000),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
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
    'decreaseReserveRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { reserveRisky: after },
            before: { reserveRisky: before },
          },
        ]) => {
          const expected = before.sub(amount) // DECREASE
          this.assert(
            after.eq(expected) || after.sub(expected).lt(1000),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this

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
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { reserveStable: after },
            before: { reserveStable: before },
          },
        ]) => {
          const expected = before.add(amount) // INCREASE
          this.assert(
            after.eq(expected) || after.sub(expected).lt(1000),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
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
      ) */
    }
  )

  Assertion.addMethod(
    'decreaseReserveStable',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { reserveStable: after },
            before: { reserveStable: before },
          },
        ]) => {
          const expected = before.sub(amount) // DECREASE
          this.assert(
            after.eq(expected) || after.sub(expected).lt(1000),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedReserveStable = oldReserve.reserveStable.sub(amount)

      this.assert(
        newReserve.reserveStable.eq(expectedReserveStable),
        `Expected ${expectedReserveStable} to be ${newReserve.reserveStable}`,
        `Expected ${expectedReserveStable} NOT to be ${newReserve.reserveStable}`,
        expectedReserveStable,
        newReserve.reserveStable
      ) */
    }
  )

  // Liquidity

  Assertion.addMethod(
    'increaseReserveLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { liquidity: after },
            before: { liquidity: before },
          },
        ]) => {
          const expected = before.add(amount) // INCREASE
          this.assert(
            after.eq(expected),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedLiquidity = oldReserve.liquidity.add(amount)

      this.assert(
        newReserve.liquidity.eq(expectedLiquidity),
        `Expected ${expectedLiquidity} to be ${newReserve.liquidity}`,
        `Expected ${expectedLiquidity} NOT to be ${newReserve.liquidity}`,
        expectedLiquidity,
        newReserve.liquidity
      ) */
    }
  )

  Assertion.addMethod(
    'decreaseReserveLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { liquidity: after },
            before: { liquidity: before },
          },
        ]) => {
          const expected = before.sub(amount) // DECREASE
          this.assert(
            after.eq(expected),
            `Expected ${after} to be ${expected}`,
            `Expected ${after} NOT to be ${expected}`,
            expected,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
      await this._obj
      const newReserve = await engine.reserves(poolId)

      const expectedLiquidity = oldReserve.liquidity.sub(amount)

      this.assert(
        newReserve.liquidity.eq(expectedLiquidity),
        `Expected ${expectedLiquidity} to be ${newReserve.liquidity}`,
        `Expected ${expectedLiquidity} NOT to be ${newReserve.liquidity}`,
        expectedLiquidity,
        newReserve.liquidity
      ) */
    }
  )

  // BlockTimestamp

  Assertion.addMethod(
    'updateReserveBlockTimestamp',
    async function (this: any, engine: EngineTypes, poolId: string, blockTimestamp: number) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(
        ([
          {
            after: { blockTimestamp: after },
          },
        ]) => {
          this.assert(
            after === blockTimestamp,
            `Expected ${after} to be ${blockTimestamp}`,
            `Expected ${after} NOT to be ${blockTimestamp}`,
            blockTimestamp,
            after
          )
        }
      )

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* await this._obj
      const newReserve = await engine.reserves(poolId)

      this.assert(
        newReserve.blockTimestamp == blockTimestamp,
        `Expected ${blockTimestamp} to be ${newReserve.blockTimestamp}`,
        `Expected ${blockTimestamp} NOT to be ${newReserve.blockTimestamp}`,
        blockTimestamp,
        newReserve.blockTimestamp
      ) */
    }
  )

  // Cumulative Risky

  Assertion.addMethod(
    'updateReserveCumulativeRisky',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(([{ after, before }]) => {
        const deltaTime = blockTimestamp - before.blockTimestamp
        const expected = before.reserveRisky.add(after.reserveRisky.mul(deltaTime)) // UPDATE
        this.assert(
          after.reserveRisky.eq(expected),
          `Expected ${after} to be ${expected}`,
          `Expected ${after} NOT to be ${expected}`,
          expected,
          after
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
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
      ) */
    }
  )

  // Cumulative Stable

  Assertion.addMethod(
    'updateReserveCumulativeStable',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(([{ after, before }]) => {
        const deltaTime = blockTimestamp - before.blockTimestamp
        const expected = before.cumulativeStable.add(after.reserveStable.mul(deltaTime)) // UPDATE
        this.assert(
          after.cumulativeStable.eq(expected),
          `Expected ${after} to be ${expected}`,
          `Expected ${after} NOT to be ${expected}`,
          expected,
          after
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
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
      ) */
    }
  )

  // Cumulative Liquidity

  Assertion.addMethod(
    'updateReserveCumulativeLiquidity',
    async function (this: any, engine: EngineTypes, poolId: string, amount: BigNumber, blockTimestamp: number) {
      const subject = this._obj
      const derivedPromise = Promise.all([getReserveChange(subject, engine, poolId)]).then(([{ after, before }]) => {
        const deltaTime = blockTimestamp - before.blockTimestamp
        const expected = before.cumulativeLiquidity.add(after.liquidity.mul(deltaTime)) // UPDATE
        this.assert(
          after.cumulativeLiquidity.eq(expected) || after.cumulativeLiquidity.sub(expected).lt(1000),
          `Expected ${after} to be ${expected}`,
          `Expected ${after} NOT to be ${expected}`,
          expected,
          after
        )
      })

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
      /* const oldReserve = await engine.reserves(poolId)
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
      ) */
    }
  )
}
