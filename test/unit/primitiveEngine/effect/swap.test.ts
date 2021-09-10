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
import { primitiveFixture } from '../../../shared/fixtures'
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
  const { riskyForStable, deltaIn, fromMargin } = testCase
  const payee = fromMargin ? `from ${signer} Margin account` : 'from Callee Balance'
  const caseType = testCase.revertMsg ? 'fail case: ' : 'success case: '
  const revert = testCase.revertMsg ? ` reverted with ${testCase.revertMsg}` : ''
  if (riskyForStable) {
    return caseType + `swapping ${deltaIn} riskyIn for stableOut ${payee}` + revert
  } else {
    return caseType + `swapping ${deltaIn} stableIn for riskyOut ${payee}` + revert
  }
}

interface SwapTestCase {
  riskyForStable: boolean
  deltaIn: Wei
  fromMargin: boolean
  toMargin: boolean
  deltaOutMin?: Wei
  signer?: number
  revertMsg?: string
}

const SuccessCases: SwapTestCase[] = [
  // 1e18
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: true,
    toMargin: false,
  },
  /* {
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
    deltaIn: parseWei('10'), // investigate
    fromMargin: true,
    toMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei('10'), // investigate
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
    deltaIn: parseWei('10'), // investigate
    fromMargin: true,
    toMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei('10'), // investigate
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

async function doSwap(
  signers: Wallet[],
  engine: MockEngine,
  router: TestRouter,
  poolId: BytesLike,
  testCase: SwapTestCase
): Promise<ContractTransaction> {
  const { riskyForStable, fromMargin, deltaIn, toMargin } = testCase
  const signerIndex = testCase.signer ? testCase.signer : 0
  const signer = signers[signerIndex]
  const target = testCase.fromMargin ? engine : router
  return await target.connect(signer).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, toMargin, HashZero)
}

function simulateSwap(pool: Pool, testCase: SwapTestCase): DebugReturn {
  const { riskyForStable, deltaIn } = testCase
  if (riskyForStable) return pool.swapAmountInRisky(deltaIn)
  else return pool.swapAmountInStable(deltaIn)
}

const DEBUG_MODE = true

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
    let poolId: string, posId: string
    let deployer: Wallet
    let engine: MockEngine, router: TestRouter
    let preBalanceRisky: BigNumber, preBalanceStable: BigNumber, preReserves: any, preSettings: any, preSpot: number
    let preInvariant: BigNumber, preMarginSigner: any, preMarginRouter: any

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
      await useMargin(this.signers[0], this.contracts, parseWei('1000'), parseWei('1000'))
      await useMargin(this.signers[0], this.contracts, parseWei('1000'), parseWei('1000'), this.contracts.router.address)
      ;[deployer, engine, router] = [this.signers[0], this.contracts.engine, this.contracts.router] // contracts

      // state of engine pre-swap
      ;[preBalanceRisky, preBalanceStable, preReserves, preSettings, preInvariant, preMarginSigner, preMarginRouter] =
        await Promise.all([
          this.contracts.risky.balanceOf(engine.address),
          this.contracts.stable.balanceOf(engine.address),
          engine.reserves(poolId),
          engine.calibrations(poolId),
          engine.invariantOf(poolId),
          engine.margins(this.signers[0].address),
          engine.margins(this.contracts.router.address),
        ])

      console.log(preReserves.reserveRisky.toString(), decimalsRisky)
      // spot price of pool pre-swap
      preSpot = getSpotPrice(
        new Wei(preReserves.reserveRisky).float / new Wei(preReserves.liquidity).float,
        pool.calibration.strike.float,
        pool.calibration.sigma.float,
        new Time(preSettings.maturity - preSettings.lastTimestamp).years
      )

      const [preRisky, preStable, preLiquidity] = [
        new Wei(preReserves.reserveRisky, decimalsRisky),
        new Wei(preReserves.reserveStable, decimalsStable),
        new Wei(preReserves.liquidity, 18),
      ]

      console.log(preRisky.float, preLiquidity.float)
      if (DEBUG_MODE)
        console.log(`
         ====== PRE =========
           spot: ${preSpot}
           risky: ${preRisky.float / preLiquidity.float}
           stable: ${preStable.float / preLiquidity.float}
           invariant: ${new FixedPointX64(preInvariant).parsed}
          `)
    })

    if (maturity.raw <= lastTimestamp.raw) {
      it('reverts on expired pool', async function () {
        await this.contracts.engine.advanceTime(lastTimestamp.raw) // go to
        await this.contracts.engine.advanceTime(120) // go pass the buffer
        const tx = doSwap(this.signers, engine, router, poolId, TestCases[0])
        await expect(tx).to.be.reverted
      })
    } else {
      for (const testCase of TestCases) {
        it(swapTestCaseDescription(testCase), async function () {
          const [reserveRisky, reserveStable, liquidity] = [
            new Wei(preReserves.reserveRisky, decimalsRisky),
            new Wei(preReserves.reserveStable, decimalsStable),
            new Wei(preReserves.liquidity, 18),
          ]

          // Get a virtual pool to simulate the swap
          const virtualPool = new Pool(
            reserveRisky,
            liquidity,
            strike,
            sigma,
            maturity,
            lastTimestamp,
            fee.float,
            reserveStable
          )

          if (DEBUG_MODE)
            console.log(`
          ====== SIMULATED PRE RESERVE =====
           risky: ${virtualPool.reserveRisky.float / virtualPool.liquidity.float}
           stable: ${virtualPool.reserveStable.float / virtualPool.liquidity.float}
           invariant: ${virtualPool.invariant.parsed}
          `)

          const tx = doSwap(this.signers, engine, router, poolId, testCase)

          // Simulate the swap from the test case
          const simulated = simulateSwap(virtualPool, testCase)
          // Execute the swap in the contract
          try {
            await tx
          } catch (error) {
            onError(error, testCase.revertMsg)
            return
          }

          // Get the new state of the contract
          const [
            postBalanceRisky,
            postBalanceStable,
            postReserve,
            postSetting,
            postInvariant,
            postMarginSigner,
            postMarginRouter,
          ] = await Promise.all([
            this.contracts.risky.balanceOf(engine.address),
            this.contracts.stable.balanceOf(engine.address),
            engine.reserves(poolId),
            engine.calibrations(poolId),
            engine.invariantOf(poolId),
            engine.margins(this.signers[0].address),
            engine.margins(this.contracts.router.address),
          ])

          const [postRisky, postStable, postLiquidity] = [
            new Wei(postReserve.reserveRisky, decimalsRisky),
            new Wei(postReserve.reserveStable, decimalsStable),
            new Wei(postReserve.liquidity, 18),
          ]
          if (DEBUG_MODE)
            console.log(`
          ====== POST RESERVE =====
           risky: ${postRisky.float}
           stable: ${postStable.float}
           invariant: post: ${new FixedPointX64(postInvariant).parsed}, pre: ${new FixedPointX64(preInvariant).parsed}
          `)
          const simLiq = simulated.pool.liquidity.float
          if (DEBUG_MODE)
            console.log(`
          ====== SIMULATED POST RESERVE =====
           risky: ${simulated.pool.reserveRisky.float / simLiq}
           stable: ${simulated.pool.reserveStable.float / simLiq}
           invariant: ${simulated.pool.invariant.parsed}
          `)

          const marginAccount = testCase.fromMargin ? preMarginSigner : preMarginRouter
          const postMarginAccount = testCase.fromMargin ? postMarginSigner : postMarginRouter
          const preBalStable = testCase.toMargin ? marginAccount.balanceStable : preBalanceStable
          const preBalRisky = testCase.toMargin ? marginAccount.balanceRisky : preBalanceRisky
          const postBalStable = testCase.toMargin ? postMarginAccount.balanceStable : postBalanceStable
          const postBalRisky = testCase.toMargin ? postMarginAccount.balanceRisky : postBalanceRisky

          let balanceOut = testCase.riskyForStable ? preBalStable.sub(postBalStable) : preBalRisky.sub(postBalRisky)
          if (testCase.toMargin) balanceOut = balanceOut.mul(-1)
          const deltaOut = testCase.riskyForStable ? reserveStable.sub(postStable) : reserveRisky.sub(postRisky)

          if (maturity.raw > lastTimestamp.raw)
            await expect(tx)
              .to.emit(engine, 'Swap')
              .withArgs(
                testCase.fromMargin ? deployer.address : router.address,
                poolId,
                testCase.riskyForStable,
                testCase.deltaIn.raw,
                deltaOut.raw
              )
          else await expect(tx).to.be.reverted

          const postSpot = getSpotPrice(
            postRisky.float / postLiquidity.float,
            pool.calibration.strike.float,
            pool.calibration.sigma.float,
            new Time(postSetting.maturity - postSetting.lastTimestamp).years
          )

          expect(simulated.nextInvariant?.parsed).to.be.closeTo(new FixedPointX64(postInvariant).parsed, 1)
          expect(balanceOut).to.be.eq(deltaOut.raw)
          const postI = new FixedPointX64(postInvariant)
          const preI = new FixedPointX64(preInvariant)
          expect(postI.parsed >= preI.parsed || postI.parsed - preI.parsed < 1e8).to.be.eq(true)
          if (testCase.riskyForStable) {
            expect(preSpot).to.be.gte(postSpot)
          } else {
            expect(postSpot).to.be.gte(preSpot)
          }
        })
      }
    }
  })
})
