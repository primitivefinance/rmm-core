import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time } from 'web3-units'

import { Calibration } from '../../../shared'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`invariant of ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    let poolId: string, posId: string

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
    })

    it('does not revert if expired', async function () {
      const cal = new Calibration(10, 1, 1, 0, 10)
      const account = this.signers[0].address
      await this.contracts.risky.mint(account, parseWei('1000').raw)
      await this.contracts.stable.mint(account, parseWei('1000').raw)
      await this.contracts.router.create(
        cal.strike.raw,
        cal.sigma.raw,
        cal.maturity.raw,
        parseWei(1, cal.decimalsRisky).sub(parseWei(cal.delta)).raw,
        parseWei('1').raw,
        constants.HashZero
      )
      await this.contracts.engine.advanceTime(10)
      const poolId = computePoolId(this.contracts.engine.address, cal.maturity.raw, cal.sigma.raw, cal.strike.raw)
      await this.contracts.router.swap(poolId, true, 2000, false, true, constants.HashZero)
      await expect(this.contracts.engine.invariantOf(poolId)).to.not.be.reverted
    })
  })
})
