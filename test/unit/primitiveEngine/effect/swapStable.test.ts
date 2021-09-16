import { Contract, Wallet } from '@ethereum-waffle/provider/node_modules/ethers'
import { HashZero } from '@ethersproject/constants'
import { expect } from 'chai'
import { FixedPointX64, parseWei, Percentage, Time, Wei } from 'web3-units'
import { Calibration } from '../../../shared'
import { primitiveFixture } from '../../../shared/fixtures'
import { useApproveAll, usePool, useTokens } from '../../../shared/hooks'
import { testContext } from '../../../shared/testContext'
import { Pool } from '../../../shared/swapUtils'

async function logRes(engine: Contract, poolId: string) {
  const res = await engine.reserves(poolId)
  const obj = {
    risky: new Wei(res.reserveRisky),
    stable: new Wei(res.reserveStable),
    liquidity: new Wei(res.liquidity),
  }

  console.log(`       - Risky: ${obj.risky.float}`)
  console.log(`       - Stable: ${obj.stable.float}`)
  return obj
}

async function logEngineCal(engine: Contract, poolId: string) {
  let cal = await engine.calibrations(poolId)
  cal = {
    strike: new Wei(cal.strike),
    sigma: new Percentage(cal.sigma),
    maturity: new Time(cal.maturity),
    lastTimestamp: new Time(cal.lastTimestamp),
  }
  console.log(`       - Strike: ${cal.strike.float}`)
  console.log(`       - Sigma: ${cal.sigma.float}`)
  console.log(`       - Maturity: ${cal.maturity.seconds}`)
  console.log(`       - lastTimestamp: ${cal.lastTimestamp.seconds}`)
  console.log(`       - tau: ${cal.maturity.sub(cal.lastTimestamp).years}`)
}

function logCal(cal: Calibration) {
  console.log(`       - Strike: ${cal.strike.float}`)
  console.log(`       - Sigma: ${cal.sigma.float}`)
  console.log(`       - Tau: ${cal.tau.years}`)
}

const DEBUG = false

testContext('Swap stable to risky', function () {
  let cal: Calibration, poolId: string, deployer: Wallet
  beforeEach(async function () {
    const fix = await this.loadFixture(primitiveFixture)
    this.contracts = fix.contracts
    cal = new Calibration(8, 1, Time.YearInSeconds + 1, 1, 8)
    deployer = this.signers[0]
    await useTokens(deployer, this.contracts, cal)
    await useApproveAll(deployer, this.contracts)
    console.log(`   Creating pool using initial delta of: ${cal.delta}, implying risky reserve of: ${1 - cal.delta}`)
    ;({ poolId } = await usePool(deployer, this.contracts, cal))
  })

  it('should fail at swapping in 7 stable', async function () {
    console.log(`\n   - Reserves: `)
    await logRes(this.contracts.engine, poolId)
    await logCal(cal)
    await logEngineCal(this.contracts.engine, poolId)

    let amount = parseWei('7')
    console.log(`       - Swapping: ${amount.float} stable`)
    await expect(this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)).to.be.reverted
  })

  it('does a swap until it breaks', async function () {
    console.log('\n Using settings:')
    await logCal(cal)

    console.log(` Before Engine Swap`)
    console.log(`   Engine invariant: ${new FixedPointX64(await this.contracts.engine.invariantOf(poolId)).parsed}`)

    console.log(`\n   - Reserves: `)
    let res = await logRes(this.contracts.engine, poolId)
    let pool = new Pool(res.risky, res.liquidity, cal.strike, cal.sigma, cal.maturity, cal.lastTimestamp, 0.0015)
    console.log(`   Virtual reserves: ${pool.reserveRisky.toString()} ${pool.reserveStable.toString()}`)

    console.log(`   - Calibration: `)
    await logEngineCal(this.contracts.engine, poolId)

    pool = new Pool(res.risky, res.liquidity, cal.strike, cal.sigma, cal.maturity, cal.lastTimestamp, 0.0015, res.stable)

    console.log(`   - Effective price: ${pool.getSpotPrice().float}`)

    // 6.15ish
    let amount = parseWei('4')
    console.log(`\n Swapping: ${amount.float} stable`)

    //await this.contracts.engine.advanceTime(Math.floor(Time.YearInSeconds / 10))
    await this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)

    console.log(` After Engine Swap`)
    const amountOut = res.risky.sub((await this.contracts.engine.reserves(poolId)).reserveRisky)

    console.log(`   - Amount out: ${amountOut.float}`)
    console.log(`   - Effective price: ${amount.div(amountOut).toString()}`)

    let invariant = await this.contracts.engine.invariantOf(poolId)
    console.log(`   Invariant raw: ${invariant.toString()}`)
    console.log(`   Engine invariant: ${new FixedPointX64(invariant).parsed}`)
    console.log(`\n   - Reserves: `)
    await logRes(this.contracts.engine, poolId)
    console.log(`   - Calibration: `)
    await logEngineCal(this.contracts.engine, poolId)

    const { invariantLast, nextInvariant, deltaOut } = pool.swapAmountInStable(amount)

    console.log(`\n   Did a virtual swap`)
    console.log(`     - Invariant prev: ${invariantLast?.parsed}, next: ${nextInvariant?.parsed}`)
    console.log(`     - Delta in: ${amount.float}, out: ${deltaOut.float}`)
    console.log(`     - New reserves risky: ${pool.reserveRisky.float}, stable: ${pool.reserveStable.float}`)

    amount = amount.sub(parseWei('0.1'))
    /* while (amount.raw.gt(0)) {
      await this.contracts.engine.advanceTime(Math.floor(Time.YearInSeconds / 10))
      console.log(`Swapping: ${amount.float} stable`)
      await this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)
      console.log(`\n   - Reserves: `)
      const res = await logRes(this.contracts.engine, poolId)
      await logCal(cal)
      console.log(`   Engine invariant: ${(await this.contracts.engine.invariantOf(poolId)).toString()}`)
      await logEngineCal(this.contracts.engine, poolId)
      amount = amount.sub(parseWei('0.1'))
    } */

    /* console.log(`\n   - Reserves: `)
    res = await logRes(this.contracts.engine, poolId)
    await this.contracts.router.swap(poolId, true, deltaOut.raw, false, false, HashZero)
    console.log(` After Engine Swap`)
    const amountOut2 = res.stable.sub((await this.contracts.engine.reserves(poolId)).reserveStable)

    console.log(`   - Amount out: ${amountOut2.float}`)
    console.log(`   - Effective price: ${amountOut2.div(deltaOut).toString()}`)
    invariant = await this.contracts.engine.invariantOf(poolId)
    console.log(`   Invariant raw: ${invariant.toString()}`)
    console.log(`   Engine invariant: ${new FixedPointX64(invariant).parsed}`)
    console.log(`\n   - Reserves: `)
    await logRes(this.contracts.engine, poolId)
    console.log(`   - Calibration: `)
    await logEngineCal(this.contracts.engine, poolId) */
  })

  it('swaps back and forth', async function () {
    console.log('\n Using settings:')
    await logCal(cal)

    console.log(` Before Engine Swap`)
    console.log(`   Engine invariant: ${new FixedPointX64(await this.contracts.engine.invariantOf(poolId)).parsed}`)

    console.log(`\n   BEFORE Reserves: `)
    let resBefore = await logRes(this.contracts.engine, poolId)

    let pool = new Pool(
      resBefore.risky,
      resBefore.liquidity,
      cal.strike,
      cal.sigma,
      cal.maturity,
      cal.lastTimestamp,
      0.0015,
      resBefore.stable
    )

    console.log(`   - Effective price: ${pool.getSpotPrice().float}`)

    let amount = parseWei('4')
    let i = 0
    while (i < 50) {
      console.log({ i })
      if (DEBUG) console.log(`\n Swapping: ${amount.float} stable`)
      let res = await logRes(this.contracts.engine, poolId)

      await this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)

      const amountOut = res.risky.sub((await this.contracts.engine.reserves(poolId)).reserveRisky)

      let invariant = await this.contracts.engine.invariantOf(poolId)
      if (DEBUG) {
        console.log(`   - Amount out: ${amountOut.float}`)
        console.log(`   - Effective price: ${amount.div(amountOut).toString()}`)
        console.log(`   Engine invariant: ${new FixedPointX64(invariant).parsed}`)
        console.log(`  - Reserves: `)
      }
      res = await logRes(this.contracts.engine, poolId)

      await this.contracts.router.swap(poolId, true, amountOut.raw, false, false, HashZero)
      const amountOut2 = res.stable.sub((await this.contracts.engine.reserves(poolId)).reserveStable)
      invariant = await this.contracts.engine.invariantOf(poolId)

      if (DEBUG) {
        console.log(`   - Amount out: ${amountOut2.float}`)
        console.log(`   - Effective price: ${amountOut2.div(amountOut).toString()}`)
        console.log(`   Engine invariant: ${new FixedPointX64(invariant).parsed}`)
        console.log(`\n   - Reserves: `)
      }
      await logRes(this.contracts.engine, poolId)
      i += 1
    }

    console.log(`   Before Effective price: ${pool.getSpotPrice().float}`)
    let resAfter = await logRes(this.contracts.engine, poolId)
    pool = new Pool(
      resAfter.risky,
      resAfter.liquidity,
      cal.strike,
      cal.sigma,
      cal.maturity,
      cal.lastTimestamp,
      0.0015,
      resAfter.stable
    )
    console.log(`   After Effective price: ${pool.getSpotPrice().float}`)

    console.log(` risky diff: ${resAfter.risky.sub(resBefore.risky).float}`)
    console.log(` stable diff: ${resAfter.stable.sub(resBefore.stable).float}`)
  })
})
