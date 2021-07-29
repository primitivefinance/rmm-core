// Standard Imports
import { expect, assert } from 'chai'
import { waffle } from 'hardhat'
import { BigNumber, BytesLike, constants, ContractTransaction, Wallet } from 'ethers'
import { MockEngine, EngineAllocate, EngineSwap } from '../../../../typechain'
// Context Imports
import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { swapFragment } from '../fragments'
import { Wei, Time, parseWei, toBN } from 'web3-units'
import { getSpotPrice } from '@primitivefinance/v2-math'
import { Functions } from '../../../../types'
import { computePoolId } from '../../utils'

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
const { strike, sigma, maturity, lastTimestamp } = config
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
  console.log(message)
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
    deltaIn: parseWei(1),
    fromMargin: true,
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(1),
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
    revertMsg: ERC20Events.EXCEEDS_BALANCE,
  },
  {
    riskyForStable: true,
    deltaIn: parseWei(1),
    fromMargin: false,
    deltaOutMin: new Wei(constants.MaxUint256),
    revertMsg: 'DeltaOutError',
  },
  {
    riskyForStable: false,
    deltaIn: parseWei(1),
    fromMargin: false,
    deltaOutMin: new Wei(constants.MaxUint256),
    revertMsg: 'DeltaOutError',
  },
  // 2e3
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
    revertMsg: 'DeltaOutError',
  },
  {
    riskyForStable: true,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
    revertMsg: 'DeltaOutError',
  },
  {
    riskyForStable: false,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: true,
    revertMsg: 'DeltaOutError',
  },
  {
    riskyForStable: false,
    deltaIn: new Wei(toBN(2000)),
    fromMargin: false,
    revertMsg: 'DeltaOutError',
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
  const signer = testCase.signer ? signers[testCase.signer] : signers[0]
  if (testCase.riskyForStable) {
    if (testCase.fromMargin) {
      swap = await engine.connect(signer).swap(poolId, true, testCase.deltaIn.raw, true, empty)
    } else {
      swap = await functions.swapXForY(signer, poolId, true, testCase.deltaIn.raw, testCase.fromMargin)
    }
  } else {
    if (testCase.fromMargin) {
      swap = await engine.swap(poolId, false, testCase.deltaIn.raw, true, empty)
    } else {
      swap = await functions.swapYForX(signer, poolId, false, testCase.deltaIn.raw, testCase.fromMargin)
    }
  }
  return swap
}

describe('Engine:swap', function () {
  before('Load context', async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineSwap', 'engineDeposit', 'engineLend', 'engineAllocate'],
      swapFragment
    )
  })

  for (const poolState of TestPools) {
    describe(poolState.description, async function () {
      let poolId: BytesLike
      let deployer: Wallet
      let engine: MockEngine, engineAllocate: EngineAllocate, engineSwap: EngineSwap
      let preBalanceRisky: BigNumber, preBalanceStable: BigNumber, preReserves: any, preSettings: any, preSpot: number
      let preInvariant: BigNumber

      beforeEach(async function () {
        ;[deployer, engine, engineAllocate, engineSwap] = [
          this.signers[0],
          this.contracts.engine,
          this.contracts.engineAllocate,
          this.contracts.engineSwap,
        ]

        poolId = computePoolId(this.contracts.factory.address, maturity.raw, sigma.raw, strike.raw)

        /* await this.contracts.engineCreate.create(
          config.strike.raw,
          config.sigma.raw,
          config.maturity.raw,
          config.spot.raw,
          parseWei('1').raw,
          empty
        ) */
        ;[preBalanceRisky, preBalanceStable, preReserves, preSettings, preInvariant] = await Promise.all([
          this.contracts.risky.balanceOf(engine.address),
          this.contracts.stable.balanceOf(engine.address),
          engine.reserves(poolId),
          engine.settings(poolId),
          engine.invariantOf(poolId),
        ])
        preSpot = getSpotPrice(
          new Wei(preReserves.reserveRisky).float,
          new Wei(preReserves.liquidity).float,
          config.strike.float,
          config.sigma.float,
          new Time(preSettings.maturity - preSettings.lastTimestamp).years
        )
        //await engineAllocate.allocateFromExternal(poolId, engineAllocate.address, parseWei('1').raw, empty)
      })

      for (const testCase of TestCases) {
        it(swapTestCaseDescription(testCase), async function () {
          const reserve = await engine.reserves(poolId)
          const tx = doSwap(this.signers, engine, poolId, testCase, this.functions)
          try {
            await tx
          } catch (error) {
            onError(error, testCase.revertMsg)
            return
          }

          console.log('Pre reserve')
          console.log(preReserves.reserveRisky.toString())
          console.log(preReserves.liquidity.toString())
          console.log(preReserves.reserveRisky.div(preReserves.liquidity).toString())

          const [postBalanceRisky, postBalanceStable, postReserve, postSetting, postInvariant] = await Promise.all([
            this.contracts.risky.balanceOf(engine.address),
            this.contracts.stable.balanceOf(engine.address),
            engine.reserves(poolId),
            engine.settings(poolId),
            engine.invariantOf(poolId),
          ])

          console.log('Post reserve')
          console.log(postReserve.reserveRisky.toString())
          console.log(postReserve.liquidity.toString())
          console.log(postReserve.reserveRisky.div(postReserve.liquidity).toString())

          const balanceOut = testCase.riskyForStable
            ? preBalanceStable.sub(postBalanceStable)
            : preBalanceRisky.sub(postBalanceRisky)

          const deltaOut = testCase.riskyForStable
            ? reserve.reserveStable.sub(postReserve.reserveStable)
            : reserve.reserveRisky.sub(postReserve.reserveRisky)

          await expect(tx)
            .to.emit(engine, EngineEvents.SWAP)
            .withArgs(
              testCase.fromMargin ? deployer.address : engineSwap.address,
              poolId,
              testCase.riskyForStable,
              testCase.deltaIn.raw,
              deltaOut
            )

          const postSpot = getSpotPrice(
            new Wei(postReserve.reserveRisky).float,
            new Wei(postReserve.liquidity).float,
            config.strike.float,
            config.sigma.float,
            new Time(postSetting.maturity - postSetting.lastTimestamp).years
          )

          expect(deltaOut).to.be.eq(balanceOut)
          expect(postInvariant).to.be.gte(preInvariant)
          if (testCase.riskyForStable) expect(preSpot).to.be.gte(postSpot)
          else expect(postSpot).to.be.gte(preSpot)
        })
      }
    })
  }
})
