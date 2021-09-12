import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`reentrancy attacks on ${pool.description} pool`, function () {
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

    describe('when calling deposit in the deposit callback', function () {
      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.depositReentrancy(this.signers[0].address, parseWei('1').raw, parseWei('1').raw, HashZero)
        ).to.be.reverted
      })
    })

    describe('when calling allocate in the allocate callback', function () {
      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.allocateFromExternalReentrancy(poolId, this.signers[0].address, parseWei('1').raw, HashZero)
        ).to.be.reverted
      })
    })
  })
})
