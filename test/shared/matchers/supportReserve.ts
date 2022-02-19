import { BigNumber } from 'ethers'
import { Awaited, EngineTypes } from '../../../types'

export type EngineReservesType = Awaited<ReturnType<EngineTypes['reserves']>>

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
    }
  )
}
