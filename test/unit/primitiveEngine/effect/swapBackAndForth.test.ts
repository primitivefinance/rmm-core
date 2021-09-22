import { Contract, Wallet } from '@ethereum-waffle/provider/node_modules/ethers'
import { HashZero } from '@ethersproject/constants'
import { expect } from 'chai'
import { FixedPointX64, parseWei, Percentage, Time, Wei } from 'web3-units'
import { Calibration } from '../../../shared'
import { primitiveFixture } from '../../../shared/fixtures'
import { useApproveAll, usePool, useTokens } from '../../../shared/hooks'
import { testContext } from '../../../shared/testContext'
import { Pool } from '../../../shared/swapUtils'
import { TestRouter } from '../../../../typechain'

async function logRes(engine: Contract, poolId: string) {
  const res = await engine.reserves(poolId)
  const obj = {
    risky: new Wei(res.reserveRisky),
    stable: new Wei(res.reserveStable),
    liquidity: new Wei(res.liquidity),
  }
  if (DEBUG) {
    console.log(`       - Risky: ${obj.risky.float}`)
    console.log(`       - Stable: ${obj.stable.float}`)
  }
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
  if (DEBUG) {
    console.log(`       - Strike: ${cal.strike.float}`)
    console.log(`       - Sigma: ${cal.sigma.float}`)
    console.log(`       - Maturity: ${cal.maturity.seconds}`)
    console.log(`       - lastTimestamp: ${cal.lastTimestamp.seconds}`)
    console.log(`       - tau: ${cal.maturity.sub(cal.lastTimestamp).years}`)
  }
}

function logCal(cal: Calibration) {
  if (DEBUG) {
    console.log(`       - Strike: ${cal.strike.float}`)
    console.log(`       - Sigma: ${cal.sigma.float}`)
    console.log(`       - Tau: ${cal.tau.years}`)
  }
}

const DEBUG = false

testContext('Swap stable to risky back and forth', function () {
  let cal: Calibration, poolId: string, deployer: Wallet, router: TestRouter
  beforeEach(async function () {
    const fix = await this.loadFixture(primitiveFixture)
    this.contracts = fix.contracts
    cal = new Calibration(8, 1, Time.YearInSeconds + 1, 1, 8)
    deployer = this.signers[0]
    await useTokens(deployer, this.contracts, cal)
    await useApproveAll(deployer, this.contracts)
    if (DEBUG)
      console.log(`   Creating pool using initial delta of: ${cal.delta}, implying risky reserve of: ${1 - cal.delta}`)
    ;({ poolId } = await usePool(deployer, this.contracts, cal))
  })

  it('swaps back and forth', async function () {
    if (DEBUG) {
      console.log('\n Using settings:')
      await logCal(cal)

      console.log(` Before Engine Swap`)
      console.log(`   Engine invariant: ${new FixedPointX64(await this.contracts.engine.invariantOf(poolId)).parsed}`)

      console.log(`\n   BEFORE Reserves: `)
    }
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

    if (DEBUG) console.log(`   - Effective price: ${pool.getSpotPrice().float}`)

    let amount = parseWei('4')
    let i = 0
    while (i < 50) {
      console.log(' Swapping back and forth... this might take a minute')
      if (DEBUG) console.log({ i })
      if (DEBUG) console.log(`\n Swapping: ${amount.float} stable`)
      let res = await logRes(this.contracts.engine, poolId)

      console.log('half^3')
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

    if (DEBUG) console.log(`   Before Effective price: ${pool.getSpotPrice().float}`)
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

    const riskyDiff = resAfter.risky.sub(resBefore.risky).float
    const stableDiff = resAfter.stable.sub(resBefore.stable).float

    if (DEBUG) {
      console.log(`   After Effective price: ${pool.getSpotPrice().float}`)

      console.log(` risky diff: ${resAfter.risky.sub(resBefore.risky).float}`)
      console.log(` stable diff: ${resAfter.stable.sub(resBefore.stable).float}`)
    }

    expect(riskyDiff).to.be.greaterThan(0)
    expect(stableDiff).to.be.greaterThan(0)
  })
})
