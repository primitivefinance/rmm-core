import expect from '../../../shared/expect'
import { BytesLike, constants, ContractTransaction, Wallet } from 'ethers'
import { Wei, parseWei, toBN, FixedPointX64 } from 'web3-units'
import { TestPools, PoolState } from '../../../shared/poolConfigs'

import { MockEngine, TestRouter } from '../../../../typechain'
import { DebugReturn, Pool } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { PrimitiveFixture, primitiveFixture } from '../../../shared/fixtures'
import { useTokens, useLiquidity, useMargin, useApproveAll, usePool } from '../../../shared/hooks'

const { HashZero } = constants

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
  /* // 2e3
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
  }, */
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

function simulateSwap(pool: Pool, testCase: SwapTestCase): DebugReturn {
  if (DEBUG_MODE) console.log(`\n   Simulating a swap`)
  const { riskyForStable, deltaIn } = testCase
  if (riskyForStable) return pool.virtualSwapAmountInRisky(deltaIn)
  else return pool.virtualSwapAmountInStable(deltaIn)
}

const DEBUG_MODE = false

TestPools.forEach(function (pool: PoolState) {
  testContext(`Engine:swap for ${pool.description} pool`, function () {
    const {
      strike,
      sigma,
      maturity,
      lastTimestamp,
      fee,
      decimalsRisky,
      decimalsStable,
      scaleFactorRisky,
      scaleFactorStable,
    } = pool.calibration
    let poolId: string
    let deployer: Wallet
    let engine: MockEngine, router: TestRouter
    let tx: any, receiver: string, target: any, swapper

    beforeEach(async function () {
      const poolFixture = async ([wallet]: Wallet[], provider: any): Promise<PrimitiveFixture> => {
        let fix = await primitiveFixture([wallet], provider)
        // if using a custom engine, create it and replace the default contracts
        if (decimalsRisky != 18 || decimalsStable != 18) {
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
      await useMargin(deployer, this.contracts, parseWei('1000'), parseWei('1000'), router.address)
    })

    if (maturity.raw <= lastTimestamp.raw) {
      it('reverts when expired beyond the buffer', async function () {
        await engine.advanceTime(lastTimestamp.raw) // go to
        await engine.advanceTime(120) // go pass the buffer
        const tx = target
          .connect(swapper)
          .swap(
            poolId,
            TestCases[0].riskyForStable,
            TestCases[0].deltaIn.raw,
            TestCases[0].fromMargin,
            TestCases[0].toMargin,
            HashZero
          )
        await expect(tx).to.be.reverted
      })
    } else {
      for (const testCase of TestCases) {
        describe(swapTestCaseDescription(testCase), async function () {
          let { riskyForStable, deltaIn, fromMargin, toMargin, signer, revertMsg } = testCase
          let virtualPool: Pool
          let deltaOut: Wei

          before(async function () {
            const dec = riskyForStable ? decimalsRisky : decimalsStable
            const prec = riskyForStable ? scaleFactorRisky : scaleFactorStable
            deltaIn = new Wei(deltaIn.div(parseWei('1', prec)).raw, dec)
          })

          beforeEach(async function () {
            swapper = this.signers[signer ? signer : 0]
            target = fromMargin ? engine : router
            receiver = fromMargin ? swapper.address : router.address

            const res = await engine.reserves(poolId)
            const { reserveRisky, reserveStable, liquidity } = res
            virtualPool = new Pool(
              new Wei(reserveRisky, decimalsRisky),
              new Wei(liquidity, 18),
              strike,
              sigma,
              maturity,
              lastTimestamp,
              fee.float,
              new Wei(reserveStable, decimalsStable)
            )

            virtualPool.setInvariant(await engine.invariantOf(poolId))

            const result = simulateSwap(virtualPool, testCase)
            deltaOut = result.deltaOut
            console.log(deltaOut.toString())
          })

          if (revertMsg) {
            it(`fails with msg ${revertMsg}`, async function () {
              tx = target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.be.reverted
            })
          } else {
            it('emits the Swap event', async function () {
              virtualPool.setInvariant(await engine.invariantOf(poolId))

              const result = simulateSwap(virtualPool, testCase)
              deltaOut = result.deltaOut
              console.log(deltaOut.toString())
              tx = target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.emit(engine, 'Swap')
            })

            it('matches the actual deltaOut', async function () {
              tx = target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
              const tokens = [this.contracts.risky, this.contracts.stable]
              await expect(tx).to.decreaseSwapOutBalance(engine, tokens, receiver, poolId, testCase)
            })

            it('invariant has increased', async function () {
              tx = target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
              await expect(tx).to.increaseInvariant(engine, poolId)
            })

            it('spot price has increased/decreased in the correct direction', async function () {
              tx = target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
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
              await target
                .connect(swapper)
                .swap(target.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw, fromMargin, toMargin, HashZero)
              const postInvariant = await engine.invariantOf(poolId)
              expect(simulated.nextInvariant?.parsed).to.be.closeTo(new FixedPointX64(postInvariant).parsed, 1)
            })
          }
        })
      }
    }
  })
})
