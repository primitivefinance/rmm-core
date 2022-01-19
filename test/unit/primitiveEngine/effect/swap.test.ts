import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { Wei, parseWei, FixedPointX64 } from 'web3-units'

import expect from '../../../shared/expect'
import { Contracts } from '../../../../types'
import { Calibration } from '../../../shared/calibration'
import { testContext } from '../../../shared/testContext'
import { VirtualPool } from '../../../shared/virtualPool'
import { TestPools, PoolState } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { useTokens, useLiquidity, useMargin, useApproveAll, usePool } from '../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

/**
 * @dev The forward math function for calculating the stable reserves given a risky
 * reserve will yield a result thats accurate and precise. The inverse trading direction function
 * is not precise, because we use approximations in the forward function.
 * This has the effect of some error when calculating in the inverse swap direction on-chain.
 * Additionally, this error is a little worse for lower decimal tokens.
 * For example, this error covers the 6 decimal case, but an error of 0.00737 would suffice for 18 decimals.
 * Therefore, to calculate a precise trade in the inverse direction, a numerical method should be used
 * on the forward math function that has the approximations.
 */
const INVERSE_DIRECTION_ERROR = 0.01 //0.0075
const BOOL_CASES = [true, false]
const { HashZero } = constants

/**
 * @notice Mints tokens, approves contract, creates a pool, and adds liquidity & margin for `deployer`
 * @param deployer Wallet to receive liquidity and tokens
 * @param contracts All contracts in the test environment
 * @param calibration Specific parameter set of a pool
 * @returns poolId of the created pool with `calibration` parameters
 */
async function setup(deployer: Wallet, contracts: Contracts, calibration: Calibration): Promise<string> {
  await useTokens(deployer, contracts, calibration) // mint test tokens
  await useApproveAll(deployer, contracts) // approve all contracts
  let { poolId } = await usePool(deployer, contracts, calibration) // create a pool with calibration params
  await useLiquidity(deployer, contracts, calibration, contracts.router.address) // add initial liquidity
  await useMargin(deployer, contracts, parseWei('10000'), parseWei('10000')) // add margin for user
  await useMargin(deployer, contracts, parseWei('10000'), parseWei('10000'), contracts.router.address) // add margin for router
  return poolId
}

export interface SwapTestCase {
  riskyForStable: boolean
  fromMargin: boolean
  toMargin: boolean
  exactOut: boolean
  signerIndex: number
}

function swapTestCaseDescription({
  riskyForStable,
  fromMargin,
  toMargin,
  exactOut,
  signerIndex = 0,
}: SwapTestCase): string {
  const signer = signerIndex ? `signer[${signerIndex}]` : 'signer[0]'
  const receiver = toMargin ? (fromMargin ? ` to ${signer} account` : ` to router account`) : ``
  const payee = fromMargin ? `from ${signer} Margin account` : 'from Callee Balance'
  const tradeType = exactOut
    ? `${riskyForStable ? 'risky in for exact stable out' : 'stable in for exact risky out'}`
    : `${riskyForStable ? 'exact risky in for stable out' : 'exact stable in for risky out'}`
  if (riskyForStable) {
    return `swapping ` + tradeType + ` ${payee}` + receiver
  } else {
    return `swapping ` + tradeType + ` ${payee}` + receiver
  }
}

function spotPriceTestCaseDescription({
  riskyForStable,
  deltaIn,
  deltaOut,
  exactOut,
}: {
  riskyForStable: boolean
  deltaIn: Wei
  deltaOut: Wei
  exactOut: boolean
}): string {
  const tradeType = exactOut
    ? `${
        riskyForStable
          ? `${deltaIn.display} risky in for exact ${deltaOut.display} stable out`
          : `${deltaIn.display} stable in for exact ${deltaOut.display} risky out`
      }`
    : `${
        riskyForStable
          ? `exact ${deltaIn.display} risky in for ${deltaOut.display} stable out`
          : `exact ${deltaIn.display} stable in for ${deltaOut.display} risky out`
      }`
  if (riskyForStable) {
    return `spot price +/- in the correct direction for swapping ` + tradeType
  } else {
    return `spot price +/- in the correct direction for swapping ` + tradeType
  }
}

// For each pool parameter set
TestPools.forEach(function (pool: PoolState) {
  testContext(`Swap in ${pool.description} pool. This will take awhile...`, function () {
    const { maturity, lastTimestamp, decimalsRisky, decimalsStable } = pool.calibration
    let poolId: string
    let virtualPool: VirtualPool

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let deployer: Wallet, other: Wallet
    before(async function () {
      ;[deployer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([deployer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(decimalsRisky, decimalsStable)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }

      deployer = this.signers[0]
      poolId = await setup(deployer, this.contracts, pool.calibration)
    })

    if (maturity.raw <= lastTimestamp.raw) {
      it('reverts when expired beyond the buffer', async function () {
        await this.contracts.engine.advanceTime(lastTimestamp.raw) // go to
        await this.contracts.engine.advanceTime(120) // go pass the buffer
        const tx = this.contracts.router.swap(deployer.address, poolId, true, '1', '1', false, false, HashZero)
        await expect(tx).to.be.reverted
      })
    } else {
      BOOL_CASES.forEach((toMargin) => {
        BOOL_CASES.forEach((fromMargin) => {
          BOOL_CASES.forEach((exactOut) => {
            BOOL_CASES.forEach((riskyForStable) =>
              describe(
                swapTestCaseDescription({ riskyForStable, fromMargin, toMargin, exactOut, signerIndex: 0 }),
                async function () {
                  let deltaIn: Wei, deltaOut: Wei, tx: any, target: any, swapper: any, receiver: string

                  beforeEach(async function () {
                    await this.contracts.engine.updateLastTimestamp(poolId) // updates to the last timestamp

                    // creates a virtual pool from the actual pool state
                    const res = await this.contracts.engine.reserves(poolId)
                    const invariant = await this.contracts.engine.invariantOf(poolId)
                    virtualPool = new VirtualPool(
                      pool.calibration,
                      new Wei(res.reserveRisky, decimalsRisky),
                      new Wei(res.liquidity),
                      new Wei(res.reserveStable, decimalsStable),
                      new FixedPointX64(invariant)
                    )

                    // gets the arguments of the swap
                    swapper = this.signers[0]
                    target = fromMargin ? this.contracts.engine : this.contracts.router // use swapper's margin if fromMargin
                    receiver = fromMargin ? swapper.address : this.contracts.router.address // send back to swapper's margin if its used to pay for swap

                    // get the range of successful swap in/out amounts
                    const maxIn = virtualPool.getMaxDeltaIn(riskyForStable)
                    const maxOut = virtualPool.getMaxDeltaOut(riskyForStable)

                    // get the swap arguments for token deltas
                    let method: any
                    if (exactOut) {
                      // exact out method for computing deltaIn
                      method = riskyForStable
                        ? this.contracts.router.getRiskyInGivenStableOut
                        : this.contracts.router.getStableInGivenRiskyOut
                      deltaOut = maxOut.mul(1).div(2) // use half the max trade size in, arbitrary amount
                      deltaIn = new Wei(
                        await method(poolId, deltaOut.raw),
                        riskyForStable ? decimalsRisky : decimalsStable
                      )
                      // apply the error if the trade is going in the inverse direction
                      if (riskyForStable)
                        deltaIn = deltaIn.mul(parseWei(1 - INVERSE_DIRECTION_ERROR)).div(VirtualPool.PRECISION)
                    } else {
                      // exact in method for computing deltaOut
                      method = riskyForStable
                        ? this.contracts.router.getStableOutGivenRiskyIn
                        : this.contracts.router.getRiskyOutGivenStableIn
                      deltaIn = maxIn.mul(1).div(2) // use half the max trade size in, arbitrary amount
                      deltaOut = new Wei(
                        await method(poolId, deltaIn.raw),
                        riskyForStable ? decimalsStable : decimalsRisky
                      )
                      // apply the error if the trade is going in the inverse direction
                      const ON_CHAIN_SWAP_ERROR = 0.02 // to-do: fix this by using a more accurate method of computing delta in/out amounts
                      if (!riskyForStable)
                        deltaOut = deltaOut.mul(parseWei(1 - ON_CHAIN_SWAP_ERROR)).div(VirtualPool.PRECISION)
                    }

                    if (deltaOut.gt(maxOut)) console.log('out more than max') // warning
                    if (deltaOut.lt('0')) console.log('delta out is lt zero') // warning
                  })

                  it('emits the Swap event', async function () {
                    tx = target
                      .connect(swapper)
                      .swap(
                        target.address,
                        poolId,
                        riskyForStable,
                        deltaIn.raw,
                        deltaOut.raw,
                        fromMargin,
                        toMargin,
                        HashZero
                      )
                    await expect(tx).to.emit(this.contracts.engine, 'Swap')
                  })

                  it('matches the actual deltaOut', async function () {
                    tx = target
                      .connect(swapper)
                      .swap(
                        target.address,
                        poolId,
                        riskyForStable,
                        deltaIn.raw,
                        deltaOut.raw,
                        fromMargin,
                        toMargin,
                        HashZero
                      )
                    const tokens = [this.contracts.risky, this.contracts.stable]
                    await expect(() => tx).to.decreaseSwapOutBalance(this.contracts.engine, tokens, receiver, poolId, {
                      riskyForStable,
                      toMargin,
                    })
                  })

                  it('invariant has increased', async function () {
                    tx = target
                      .connect(swapper)
                      .swap(
                        target.address,
                        poolId,
                        riskyForStable,
                        deltaIn.raw,
                        deltaOut.raw,
                        fromMargin,
                        toMargin,
                        HashZero
                      )
                    await expect(() => tx).to.increaseInvariant(this.contracts.engine, poolId)
                  })

                  it('spot price has increased/decreased in the correct direction', async function () {
                    tx = target
                      .connect(swapper)
                      .swap(
                        target.address,
                        poolId,
                        riskyForStable,
                        deltaIn.raw,
                        deltaOut.raw,
                        fromMargin,
                        toMargin,
                        HashZero
                      )
                    await expect(() => tx).to.updateSpotPrice(this.contracts.engine, pool.calibration, riskyForStable)
                  })
                }
              )
            )
          })
        })
      })
    }
  })
})
