import expect from '../../../shared/expect'
import { assert } from 'chai'
import { waffle } from 'hardhat'
import { BigNumber, BytesLike, constants, ContractTransaction, Wallet } from 'ethers'
import { Wei, Time, parseWei, toBN, FixedPointX64, parsePercentage, Percentage } from 'web3-units'
import { getSpotPrice } from '@primitivefinance/v2-math'

import { Contracts } from '../../../../types'
import { MockEngine, EngineSwap } from '../../../../typechain'
import loadContext, { DEFAULT_CONFIG as calibration } from '../../context'
import { Calibration, DebugReturn, Pool, computePoolId } from '../../../shared'
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
    deltaIn: parseWei('1'),
    fromMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei('1'),
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
  calibration: Calibration
}

const calibrations: any = {
  ['expired']: new Calibration(10, 1, Time.YearInSeconds, Time.YearInSeconds + 1, 10),
  ['itm']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5),
  ['otm']: new Calibration(5, 1, Time.YearInSeconds + 1, 1, 10),
  ['highfee']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(0.1)),
  ['feeless']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, new Percentage(toBN(0))),
}
const TestPools: PoolState[] = [
  {
    description: `standard pool`,
    calibration: calibration,
  },

  {
    description: `expired pool`,
    calibration: calibrations.expired,
  } /*
   {
    description: `in the money pool`,
    calibration: calibrations.itm,
  },
  {
    description: `out of the money pool`,
    calibration: calibrations.otm,
  },
  {
    description: `high fee pool`,
    calibration: calibrations.highfee,
  },
  {
    description: `feeless pool`,
    calibration: calibrations.feeless,
  }, */,
]

async function doSwap(
  signers: Wallet[],
  engine: MockEngine,
  engineSwap: EngineSwap,
  poolId: BytesLike,
  testCase: SwapTestCase
): Promise<ContractTransaction> {
  const { riskyForStable, fromMargin, deltaIn } = testCase
  const signerIndex = testCase.signer ? testCase.signer : 0
  const signer = signers[signerIndex]
  const target = testCase.fromMargin ? engine : engineSwap
  return await target.connect(signer).swap(poolId, riskyForStable, deltaIn.raw, fromMargin, HashZero)
}

function simulateSwap(pool: Pool, testCase: SwapTestCase): DebugReturn {
  const { riskyForStable, deltaIn } = testCase
  if (riskyForStable) return pool.swapAmountInRisky(deltaIn)
  else return pool.swapAmountInStable(deltaIn)
}

const DEBUG_MODE = false

export async function beforeEachSwap(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.engineDeposit.deposit(
    contracts.engineAllocate.address,
    parseWei('1000').raw,
    parseWei('1000').raw,
    HashZero
  )
  await contracts.engineDeposit.deposit(contracts.engineSwap.address, parseWei('1000').raw, parseWei('1000').raw, HashZero)
  await contracts.engineDeposit.deposit(signers[0].address, parseWei('10000').raw, parseWei('10000').raw, HashZero)
}

describe('Engine:swap', function () {
  before('Load swap context', async function () {
    loadContext(waffle.provider, [
      'engineCreate',
      'engineSwap',
      'engineDeposit',
      'engineSupply',
      'engineAllocate',
      'testReplicationMath',
    ])
  })

  for (const poolState of TestPools) {
    describe(poolState.description, async function () {
      let poolId: BytesLike
      let deployer: Wallet
      let engine: MockEngine, engineSwap: EngineSwap
      let preBalanceRisky: BigNumber, preBalanceStable: BigNumber, preReserves: any, preSettings: any, preSpot: number
      let preInvariant: BigNumber
      const { strike, sigma, maturity, lastTimestamp, delta, fee } = poolState.calibration

      beforeEach(async function () {
        await beforeEachSwap(this.signers, this.contracts)
        await this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          parseWei('100').raw,
          HashZero
        )
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
          calibration.strike.float,
          calibration.sigma.float,
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
           invariant: ${new FixedPointX64(preInvariant).parsed}
          `)
      })

      if (maturity.raw <= lastTimestamp.raw) {
        it('reverts on expired pool', async function () {
          await this.contracts.engine.advanceTime(lastTimestamp.raw) // go to
          await this.contracts.engine.advanceTime(120) // go pass the buffer
          const tx = doSwap(this.signers, engine, engineSwap, poolId, TestCases[0])
          await expect(tx).to.be.reverted
        })
      } else {
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

            const tx = doSwap(this.signers, engine, engineSwap, poolId, testCase)
            // if expired
            /* if (maturity.raw <= lastTimestamp.raw) {
              await this.contracts.engine.advanceTime(120) // go passed the buffer
              await expect(tx).to.be.reverted
              return
            } */

            // Simulate the swap from the test case
            const simulated = simulateSwap(pool, testCase)
            // Execute the swap in the contract
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

            const balanceOut = testCase.riskyForStable
              ? preBalanceStable.sub(postBalanceStable)
              : preBalanceRisky.sub(postBalanceRisky)

            const deltaOut = testCase.riskyForStable ? reserveStable.sub(postStable) : reserveRisky.sub(postRisky)

            if (maturity.raw > lastTimestamp.raw)
              await expect(tx)
                .to.emit(engine, 'Swap')
                .withArgs(
                  testCase.fromMargin ? deployer.address : engineSwap.address,
                  poolId,
                  testCase.riskyForStable,
                  testCase.deltaIn.raw,
                  deltaOut.raw
                )
            else await expect(tx).to.be.reverted

            const postSpot = getSpotPrice(
              postRisky.float / postLiquidity.float,
              calibration.strike.float,
              calibration.sigma.float,
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
  }
})
