import { Contract, Wallet } from '@ethereum-waffle/provider/node_modules/ethers'
import { HashZero } from '@ethersproject/constants'
import { expect } from 'chai'
import { parseWei, Time, Wei } from 'web3-units'
import { Calibration } from '../../../shared'
import { primitiveFixture } from '../../../shared/fixtures'
import { useApproveAll, usePool, useTokens } from '../../../shared/hooks'
import { testContext } from '../../../shared/testContext'

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

function logCal(cal: Calibration) {
  console.log(`       - Strike: ${cal.strike.float}`)
  console.log(`       - Sigma: ${cal.sigma.float}`)
  console.log(`       - Tau: ${cal.tau.years}`)
}

testContext('Swap stable to risky', function () {
  let cal: Calibration, poolId: string, deployer: Wallet
  beforeEach(async function () {
    const fix = await this.loadFixture(primitiveFixture)
    this.contracts = fix.contracts
    cal = new Calibration(8, 1, Time.YearInSeconds, 0, 8)
    deployer = this.signers[0]
    await useTokens(deployer, this.contracts, cal)
    await useApproveAll(deployer, this.contracts)
    ;({ poolId } = await usePool(deployer, this.contracts, cal))
  })

  it('should fail at swapping in 7 stable', async function () {
    console.log(`\n   - Reserves: `)
    await logRes(this.contracts.engine, poolId)

    let amount = parseWei('7')
    console.log(`       - Swapping: ${amount.float} stable`)
    await expect(this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)).to.be.reverted
  })

  it('does a swap until it breaks', async function () {
    console.log(`\n   - Reserves: `)
    await logRes(this.contracts.engine, poolId)
    await logCal(cal)
    // 6.15ish
    let amount = parseWei('4')
    while (amount.raw.gt(0)) {
      console.log(`       - Swapping: ${amount.float} stable`)
      await this.contracts.router.swap(poolId, false, amount.raw, false, false, HashZero)
      amount = amount.sub(parseWei('1'))
    }
  })
})
