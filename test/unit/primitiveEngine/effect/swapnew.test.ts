import expect from '../../../shared/expect'
import { assert } from 'chai'
import { waffle } from 'hardhat'
import { BigNumber, BytesLike, constants, ContractTransaction, Wallet } from 'ethers'
import { Wei, Time, parseWei, toBN, FixedPointX64, parsePercentage, Percentage } from 'web3-units'
import { getSpotPrice } from '@primitivefinance/v2-math'
import { TestPools, PoolState } from '../../../shared/poolConfigs'

import { Contracts } from '../../../../types'
import { MockEngine, TestRouter } from '../../../../typechain'
import { Calibration, DebugReturn, Pool, computePoolId } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { PrimitiveFixture, primitiveFixture } from '../../../shared/fixtures'
import { useTokens, useLiquidity, useMargin, useApproveAll, usePool } from '../../../shared/hooks'

const { HashZero } = constants

const onError = (error: any, revertReason: string | undefined) => {
  const shouldRevert = typeof revertReason != undefined
  // See https://github.com/ethers-io/ethers.js/issues/829
  const isEstimateGasError = error instanceof Object && error.code === 'UNPREDICTABLE_GAS_LIMIT' && 'error' in error

  if (isEstimateGasError) {
    error = error.error
  }

  const reasonsList = error.results && Object.values(error.results).map((o: any) => o.reason)
  const message = error instanceof Object && 'message' in error ? error.message : JSON.stringify(error)
  const isReverted = reasonsList
    ? reasonsList.some((r: string) => r === revertReason)
    : message.includes('revert') && message.includes(revertReason) && shouldRevert
  const isThrown = message.search('invalid opcode') >= 0 && revertReason === ''
  if (shouldRevert) {
    assert(isReverted || isThrown, `Expected transaction to NOT revert, but reverted with: ${error}`)
  } else {
    assert(
      isReverted || isThrown,
      `Expected transaction to be reverted with ${revertReason}, but other exception was thrown: ${error}`
    )
  }
  return error
}

function swapTestCaseDescription(testCase: SwapTestCase): string {
  const signer = testCase.signer ? `signer[${testCase.signer}]` : 'signer[0]'
  const { riskyForStable, deltaIn, fromMargin, toMargin } = testCase
  const receiver = toMargin ? (fromMargin ? ` to ${signer} account` : ` to router account`) : ``
  const payee = fromMargin ? `from ${signer} Margin account` : 'from Callee Balance'
  const caseType = testCase.revertMsg ? 'fail case: ' : 'success case: '
  const revert = testCase.revertMsg ? ` reverted with ${testCase.revertMsg}` : ''
  if (riskyForStable) {
    return caseType + `swapping ${deltaIn} riskyIn for stableOut ${payee}` + receiver + revert
  } else {
    return caseType + `swapping ${deltaIn} stableIn for riskyOut ${payee}` + receiver + revert
  }
}

export interface SwapTestCase {
  riskyForStable: boolean
  deltaIn: Wei
  fromMargin: boolean
  toMargin: boolean
  deltaOutMin?: Wei
  signer?: number
  revertMsg?: string
}

export const SuccessCases: SwapTestCase[] = [
  // 1e18
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: true,
    toMargin: false,
  },
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: false,
    toMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: true,
    toMargin: false,
  },

  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: false,
    toMargin: false,
  },
  // 2e3
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
    toMargin: false,
  },
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
    toMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10), // investigate
    fromMargin: true,
    toMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10), // investigate
    fromMargin: false,
    toMargin: false,
  },
  // 1e18
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: true,
    toMargin: true,
  },
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: false,
    toMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: true,
    toMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: false,
    toMargin: true,
  },
  // 2e3
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
    toMargin: true,
  },
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
    toMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10), // investigate
    fromMargin: true,
    toMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10), // investigate
    fromMargin: false,
    toMargin: true,
  },
]

const FailCases: SwapTestCase[] = [
  // 1e18

  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: true,
    toMargin: false,
    signer: 1,
    revertMsg: 'panic code',
  },
  /* {
    riskyForStable: false,
    deltaIn: parseWei(1),
    fromMargin: true,
    toMargin: false,
    signer: 1,
    revertMsg: 'panic code',
  }, */
]

const TestCases: SwapTestCase[] = [...SuccessCases, ...FailCases]

async function doSwap(
  signers: Wallet[],
  engine: MockEngine,
  router: TestRouter,
  poolId: BytesLike,
  testCase: SwapTestCase
): Promise<ContractTransaction> {
  if (DEBUG_MODE) console.log(`\n   Executing a swap`)
  const { riskyForStable, fromMargin, deltaIn, toMargin } = testCase
  const signerIndex = testCase.signer ? testCase.signer : 0
  const signer = signers[signerIndex]
  const target = testCase.fromMargin ? engine : router
  return await target.connect(signer).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
}

function simulateSwap(pool: Pool, testCase: SwapTestCase): DebugReturn {
  if (DEBUG_MODE) console.log(`\n   Simulating a swap`)
  const { riskyForStable, deltaIn } = testCase
  if (riskyForStable) return pool.swapAmountInRisky(deltaIn)
  else return pool.swapAmountInStable(deltaIn)
}

const DEBUG_MODE = false

TestPools.forEach(function (pool: PoolState) {
  testContext(`Engine:swap for ${pool.description} pool`, function () {
    const {
      strike,
      sigma,
      maturity,
      lastTimestamp,
      delta,
      spot,
      fee,
      decimalsRisky,
      decimalsStable,
      precisionRisky,
      precisionStable,
    } = pool.calibration
    let poolId: string
    let deployer: Wallet
    let engine: MockEngine, router: TestRouter

    beforeEach(async function () {
      /* const poolFixture = async ([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> => {
        let fix = await primitiveFixture([wallet], provider)
        // if using a custom engine, create it and replace the default contracts
        if (pool.customEngine) {
          const { risky, stable, engine } = await fix.createEngine(decimalsRisky, decimalsStable)
          if (DEBUG_MODE)
            console.log(
              `\n   Updating Test Router from ${fix.contracts.engine.address.slice(0, 6)} to ${engine.address.slice(0, 6)}`
            )
          fix.contracts.risky = risky
          fix.contracts.stable = stable
          fix.contracts.engine = engine
          await fix.contracts.router.setEngine(engine.address) // set the router's engine
        }

        if (DEBUG_MODE) console.log(`\n   Loaded pool fixture`)
        return fix
      }

      const fixture = await this.loadFixture(poolFixture)
      this.contracts = fixture.contracts
      ;[deployer, engine, router] = [this.signers[0], this.contracts.engine, this.contracts.router] // contracts

      await useTokens(deployer, this.contracts, pool.calibration)
      await useApproveAll(deployer, this.contracts)
      ;({ poolId } = await usePool(deployer, this.contracts, pool.calibration))
      await useLiquidity(deployer, this.contracts, pool.calibration, router.address)
      await useMargin(deployer, this.contracts, parseWei('1000'), parseWei('1000'))
      await useMargin(deployer, this.contracts, parseWei('1000'), parseWei('1000'), router.address) */
    })

    if (maturity.raw <= lastTimestamp.raw) {
      it('reverts on expired pool', async function () {
        await engine.advanceTime(lastTimestamp.raw) // go to
        await engine.advanceTime(120) // go pass the buffer
        const tx = doSwap(this.signers, engine, router, poolId, TestCases[0])
        await expect(tx).to.be.reverted
      })
    } else {
      for (const testCase of TestCases) {
        describe(swapTestCaseDescription(testCase), async function () {
          let { riskyForStable, deltaIn, fromMargin, toMargin, signer, revertMsg } = testCase
          let tx: any, receiver: string, target: any, swapper
          beforeEach(async function () {
            const poolFixture = async ([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> => {
              let fix = await primitiveFixture([wallet], provider)
              // if using a custom engine, create it and replace the default contracts
              if (pool.customEngine) {
                const { risky, stable, engine } = await fix.createEngine(decimalsRisky, decimalsStable)
                if (DEBUG_MODE)
                  console.log(
                    `\n   Updating Test Router from ${fix.contracts.engine.address.slice(0, 6)} to ${engine.address.slice(
                      0,
                      6
                    )}`
                  )
                fix.contracts.risky = risky
                fix.contracts.stable = stable
                fix.contracts.engine = engine
                await fix.contracts.router.setEngine(engine.address) // set the router's engine
              }

              if (DEBUG_MODE) console.log(`\n   Loaded pool fixture`)
              return fix
            }

            const fixture = await this.loadFixture(poolFixture)
            this.contracts = fixture.contracts
            ;[deployer, engine, router] = [this.signers[0], this.contracts.engine, this.contracts.router] // contracts

            await useTokens(deployer, this.contracts, pool.calibration)
            await useApproveAll(deployer, this.contracts)
            ;({ poolId } = await usePool(deployer, this.contracts, pool.calibration))
            await useLiquidity(deployer, this.contracts, pool.calibration, router.address)
            await useMargin(deployer, this.contracts, parseWei('1000'), parseWei('1000'))
            await useMargin(deployer, this.contracts, parseWei('1000'), parseWei('1000'), router.address)

            const dec = riskyForStable ? decimalsRisky : decimalsStable
            const prec = riskyForStable ? precisionRisky : precisionStable
            deltaIn = new Wei(deltaIn.div(parseWei('1', prec)).raw, dec)
            console.log('delta in', deltaIn.float)
            swapper = this.signers[signer ? signer : 0]
            target = fromMargin ? engine : router
            receiver = fromMargin ? swapper.address : router.address

            const res = await engine.reserves(poolId)
            const { reserveRisky, reserveStable, liquidity } = res
            const maxSwapInAmount = riskyForStable ? parseWei(1, decimalsRisky).sub(reserveRisky) : strike.sub(reserveStable)
            if (maxSwapInAmount.mul(liquidity).div(1e18).gte(deltaIn)) {
              console.log('More than max swap in amount!')
              console.log(maxSwapInAmount.mul(liquidity).div(1e18).toString(), '<', deltaIn.toString())
            }
          })

          if (revertMsg) {
            it(`fails with msg ${revertMsg}`, async function () {
              tx = target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.be.reverted
            })
          } else {
            it('emits the Swap event', async function () {
              tx = target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.emit(engine, 'Swap')
            })

            it('matches the actual deltaOut', async function (done) {
              let res = await engine.reserves(poolId)
              tx = target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              //await tx
              const tokens = [this.contracts.risky, this.contracts.stable]
              setTimeout(async function () {
                try {
                  await expect(tx).to.decreaseSwapOutBalance(engine, tokens, receiver, poolId, testCase)
                  done()
                } catch (e) {
                  done(e)
                }
              }, 100)

              await expect(tx).to.decreaseSwapOutBalance(
                engine,
                [this.contracts.risky, this.contracts.stable],
                receiver,
                poolId,
                testCase
              )

              function bnToNumber(bn: BigNumber): number {
                return new Wei(bn).float
              }

              let { reserveRisky, reserveStable } = res
              res = await engine.reserves(poolId)
              console.log(reserveRisky.toString(), reserveStable.toString())
              ;({ reserveRisky, reserveStable } = res)
              console.log(reserveRisky.toString(), reserveStable.toString())
            })

            it('invariant has increased', async function () {
              tx = target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.increaseInvariant(engine, poolId)
            })

            it('spot price has increased/decreased in the correct direction', async function () {
              tx = target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.updateSpotPrice(engine, pool.calibration, testCase.riskyForStable)
            })

            it('matches the simulated swap', async function () {
              const res = await engine.reserves(poolId)
              const { reserveRisky, reserveStable, liquidity } = res
              const virtualPool = new Pool(
                new Wei(reserveRisky, decimalsRisky),
                new Wei(liquidity, 18),
                strike,
                sigma,
                maturity,
                lastTimestamp,
                fee.float,
                new Wei(reserveStable, decimalsStable)
              )
              const simulated = simulateSwap(virtualPool, testCase)
              await target.connect(swapper).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
              const postInvariant = await engine.invariantOf(poolId)
              expect(simulated.nextInvariant?.parsed).to.be.closeTo(new FixedPointX64(postInvariant).parsed, 1)
            })
          }
        })
      }
    }
  })
})
