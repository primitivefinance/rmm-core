// Standard Imports
import { expect, assert } from 'chai'
import { waffle } from 'hardhat'
import { BigNumber, BytesLike, constants, ContractTransaction, Wallet } from 'ethers'
import { MockEngine, EngineSwap } from '../../../../typechain'
// Context Imports
import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { swapFragment } from '../fragments'
import { Wei, Time, parseWei, toBN, Integer64x64 } from 'web3-units'
import { getSpotPrice } from '@primitivefinance/v2-math'
import { Functions } from '../../../../types'
import { computePoolId } from '../../../shared/utils'
import { DebugReturn, Pool } from '../../../shared/swapUtils'

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}
export const EngineEvents = {
  DEPOSITED: 'Deposited',
  WITHDRAWN: 'Withdrawn',
  CREATE: 'Create',
  UPDATE: 'Update',
  ADDED_BOTH: 'AddedBoth',
  REMOVED_BOTH: 'RemovedBoth',
  SWAP: 'Swap',
  LOANED: 'Loaned',
  CLAIMED: 'Claimed',
  BORROWED: 'Borrowed',
  REPAID: 'Repaid',
}

// Constants
const { strike, sigma, maturity, lastTimestamp, delta, fee } = config
const empty: BytesLike = constants.HashZero

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
  const payee = testCase.fromMargin ? `from ${signer} Margin account` : 'from Callee Balance'
  const caseType = testCase.revertMsg ? 'fail case: ' : 'success case: '
  const revert = testCase.revertMsg ? ` reverted with ${testCase.revertMsg}` : ''
  if (testCase.riskyForStable) {
    return caseType + `swapping ${testCase.deltaIn} riskyIn for stableOut ${payee}` + revert
  } else {
    return caseType + `swapping ${testCase.deltaIn} stableIn for riskyOut ${payee}` + revert
  }
}

interface SwapTestCase {
  riskyForStable: boolean
  deltaIn: Wei
  fromMargin: boolean
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
  },
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(10),
    fromMargin: false,
  },
  // 2e3
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
  },
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
  },
  {
    riskyForStable: false,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
  },
]

const FailCases: SwapTestCase[] = [
  // 1e18
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: true,
    signer: 1,
    revertMsg: 'panic code',
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(1),
    fromMargin: true,
    signer: 1,
    revertMsg: 'panic code',
  },
]

const TestCases: SwapTestCase[] = [...SuccessCases, ...FailCases]

interface PoolState {
  description: string
  strike: number
  sigma: number
  maturity: number
  lastTimestamp: number
}
const TestPools: PoolState[] = [
  {
    description: `standard pool`,
    strike: strike.float,
    sigma: sigma.float,
    maturity: maturity.raw,
    lastTimestamp: lastTimestamp.raw,
  },
]

async function doSwap(
  signers: Wallet[],
  engine: MockEngine,
  poolId: BytesLike,
  testCase: SwapTestCase,
  functions: Functions
): Promise<ContractTransaction> {
  let swap: ContractTransaction
  const signerIndex = testCase.signer ? testCase.signer : 0
  const signer = signers[signerIndex]
  if (testCase.riskyForStable) {
    if (testCase.fromMargin) {
      swap = await engine.connect(signer).swap(poolId, true, testCase.deltaIn.raw, true, empty)
    } else {
      swap = await functions.swapXForY(signer, poolId, true, testCase.deltaIn.raw, testCase.fromMargin)
    }
  } else {
    if (testCase.fromMargin) {
      swap = await engine.connect(signer).swap(poolId, false, testCase.deltaIn.raw, true, empty)
    } else {
      swap = await functions.swapYForX(signer, poolId, false, testCase.deltaIn.raw, testCase.fromMargin)
    }
  }
  return swap
}

function simulateSwap(pool: Pool, testCase: SwapTestCase): DebugReturn {
  const riskyForStable = testCase.riskyForStable
  const deltaIn = testCase.deltaIn
  if (riskyForStable) {
    return pool.swapAmountInRisky(deltaIn)
  } else {
    return pool.swapAmountInStable(deltaIn)
  }
}

const DEBUG_MODE = false

describe('Engine:swap', function () {
  before('Load swap context', async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineSwap', 'engineDeposit', 'engineLend', 'engineAllocate', 'testReplicationMath'],
      swapFragment
    )
  })

  for (const poolState of TestPools) {
    describe(poolState.description, async function () {
      let poolId: BytesLike
      let deployer: Wallet
      let engine: MockEngine, engineSwap: EngineSwap
      let preBalanceRisky: BigNumber, preBalanceStable: BigNumber, preReserves: any, preSettings: any, preSpot: number
      let preInvariant: BigNumber

      beforeEach(async function () {
        ;[deployer, engine, engineSwap] = [this.signers[0], this.contracts.engine, this.contracts.engineSwap] // contracts
        poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw) // pool id for parameters

        // state of engine pre-swap
        ;[preBalanceRisky, preBalanceStable, preReserves, preSettings, preInvariant] = await Promise.all([
          this.contracts.risky.balanceOf(engine.address),
          this.contracts.stable.balanceOf(engine.address),
          engine.reserves(poolId),
          engine.calibrations(poolId),
          engine.invariantOf(poolId),
        ])

        // spot price of pool pre-swap
        preSpot = getSpotPrice(
          new Wei(preReserves.reserveRisky).float / new Wei(preReserves.liquidity).float,
          config.strike.float,
          config.sigma.float,
          new Time(preSettings.maturity - preSettings.lastTimestamp).years
        )

        const [preRisky, preStable, preLiquidity] = [
          new Wei(preReserves.reserveRisky),
          new Wei(preReserves.reserveStable),
          new Wei(preReserves.liquidity),
        ]
        if (DEBUG_MODE)
          console.log(`
         ====== PRE =========
           spot: ${preSpot}
           risky: ${preRisky.float / preLiquidity.float}
           stable: ${preStable.float / preLiquidity.float}
           invariant: ${new Integer64x64(preInvariant).parsed}
          `)
      })

      for (const testCase of TestCases) {
        it(swapTestCaseDescription(testCase), async function () {
          const [reserveRisky, reserveStable, liquidity] = [
            new Wei(preReserves.reserveRisky),
            new Wei(preReserves.reserveStable),
            new Wei(preReserves.liquidity),
          ]

          // Get a virtual pool to simulate the swap
          const pool = new Pool(reserveRisky, liquidity, strike, sigma, maturity, lastTimestamp, fee.float, reserveStable)

          if (DEBUG_MODE)
            console.log(`
          ====== SIMULATED PRE RESERVE =====
           risky: ${pool.reserveRisky.float / pool.liquidity.float}
           stable: ${pool.reserveStable.float / pool.liquidity.float}
           invariant: ${pool.invariant.parsed}
          `)

          // Simulate the swap from the test case
          const simulated = simulateSwap(pool, testCase)
          // Execute the swap in the contract
          const tx = doSwap(this.signers, engine, poolId, testCase, this.functions)
          try {
            await tx
          } catch (error) {
            onError(error, testCase.revertMsg)
            return
          }

          // Get the new state of the contract
          const [postBalanceRisky, postBalanceStable, postReserve, postSetting, postInvariant] = await Promise.all([
            this.contracts.risky.balanceOf(engine.address),
            this.contracts.stable.balanceOf(engine.address),
            engine.reserves(poolId),
            engine.calibrations(poolId),
            engine.invariantOf(poolId),
          ])

          const [postRisky, postStable, postLiquidity] = [
            new Wei(postReserve.reserveRisky),
            new Wei(postReserve.reserveStable),
            new Wei(postReserve.liquidity),
          ]
          if (DEBUG_MODE)
            console.log(`
          ====== POST RESERVE =====
           risky: ${postRisky.float}
           stable: ${postStable.float}
           invariant: post: ${new Integer64x64(postInvariant).parsed}, pre: ${new Integer64x64(preInvariant).parsed}
          `)
          const simLiq = simulated.pool.liquidity.float
          if (DEBUG_MODE)
            console.log(`
          ====== SIMULATED POST RESERVE =====
           risky: ${simulated.pool.reserveRisky.float / simLiq}
           stable: ${simulated.pool.reserveStable.float / simLiq}
           invariant: ${simulated.pool.invariant.parsed}
          `)

          const balanceOut = testCase.riskyForStable
            ? preBalanceStable.sub(postBalanceStable)
            : preBalanceRisky.sub(postBalanceRisky)

          const deltaOut = testCase.riskyForStable ? reserveStable.sub(postStable) : reserveRisky.sub(postRisky)

          await expect(tx)
            .to.emit(engine, EngineEvents.SWAP)
            .withArgs(
              testCase.fromMargin ? deployer.address : engineSwap.address,
              poolId,
              testCase.riskyForStable,
              testCase.deltaIn.raw,
              deltaOut.raw
            )

          const postSpot = getSpotPrice(
            postRisky.float / postLiquidity.float,
            config.strike.float,
            config.sigma.float,
            new Time(postSetting.maturity - postSetting.lastTimestamp).years
          )

          expect(simulated.nextInvariant?.parsed).to.be.closeTo(new Integer64x64(postInvariant).parsed, 1)
          expect(balanceOut).to.be.eq(deltaOut.raw)
          const postI = new Integer64x64(postInvariant)
          const preI = new Integer64x64(preInvariant)
          expect(postI.parsed >= preI.parsed || postI.parsed - preI.parsed < 1e8).to.be.eq(true)
          if (testCase.riskyForStable) {
            expect(preSpot).to.be.gte(postSpot)
          } else {
            expect(postSpot).to.be.gte(preSpot)
          }

          // Simulation comparisons
          //expect(postSpot).to.be.closeTo(simulated.effectivePriceOutStable?.float, 1)
        })
      }
    })
  }
})
