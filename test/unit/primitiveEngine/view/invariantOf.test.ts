import { constants, Wallet } from 'ethers'
import { parsePercentage, parseWei } from 'web3-units'

import expect from '../../../shared/expect'
import { Calibration } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { computePoolId, scaleUp } from '../../../shared/utils'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { customDecimalsFixture, PrimitiveFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'

TestPools.forEach(function (pool: PoolState) {
  testContext(`invariant of ${pool.description} pool`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration
    let poolId: string

    let fixtureToLoad: ([wallet]: Wallet[], provider: any) => Promise<PrimitiveFixture>
    before(async function () {
      fixtureToLoad = customDecimalsFixture(decimalsRisky, decimalsStable)
    })

    beforeEach(async function () {
      const fixture = await this.loadFixture(fixtureToLoad)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    it('does not revert if expired', async function () {
      const cal = new Calibration(10, 1, 1, 0, 10, parsePercentage(1 - 0.0015), decimalsRisky, decimalsStable)
      const account = this.signers[0].address
      await this.contracts.risky.mint(account, parseWei('1000').raw)
      await this.contracts.stable.mint(account, parseWei('1000').raw)
      await this.contracts.router.create(
        cal.strike.raw,
        cal.sigma.raw,
        cal.maturity.raw,
        cal.gamma.raw,
        scaleUp(1, cal.decimalsRisky).sub(scaleUp(cal.delta, cal.decimalsRisky)).raw,
        parseWei('1').raw,
        constants.HashZero
      )
      await this.contracts.engine.advanceTime(10)
      poolId = computePoolId(
        this.contracts.engine.address,
        cal.maturity.raw,
        cal.sigma.raw,
        cal.strike.raw,
        cal.gamma.raw
      )
      await this.contracts.router.swap(
        this.contracts.router.address,
        poolId,
        true,
        2000,
        1,
        false,
        true,
        constants.HashZero
      )
      await expect(this.contracts.engine.invariantOf(poolId)).to.not.be.reverted
    })
  })
})
