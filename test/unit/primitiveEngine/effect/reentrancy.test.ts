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
    const delLiquidity = parseWei('1')

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
    })

    describe('when calling deposit in the deposit callback', function () {
      beforeEach(async function () {
        await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      })

      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.deposit(this.signers[0].address, parseWei('1').raw, parseWei('1').raw, HashZero)
        ).to.be.reverted
      })
    })

    describe('when calling allocate in the allocate callback', function () {
      beforeEach(async function () {
        await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      })

      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.allocate(poolId, this.signers[0].address, parseWei('1').raw, HashZero)
        ).to.be.reverted
      })
    })

    describe('when calling borrow in the borrow callback', function () {
      beforeEach(async function () {
        await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
        await this.contracts.router.allocateFromExternal(
          poolId,
          this.contracts.router.address,
          parseWei('100').raw,
          HashZero
        )
        await this.contracts.router.supply(poolId, parseWei('100').mul(8).div(10).raw)
      })

      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.signers[0].address, parseWei('1').raw, '0', HashZero)
        ).to.be.reverted
      })
    })

    describe('when calling repay in the repay callback', function () {
      beforeEach(async function () {
        await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
        await this.contracts.router.allocateFromExternal(
          poolId,
          this.contracts.router.address,
          parseWei('100').raw,
          HashZero
        )
        await this.contracts.router.supply(poolId, parseWei('100').mul(8).div(10).raw)
        await this.contracts.router.borrowWithGoodCallback(
          poolId,
          this.contracts.router.address,
          parseWei('1').raw,
          '0',
          HashZero
        )
      })

      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.repay(poolId, this.contracts.router.address, parseWei('1').raw, '0', false, HashZero)
        ).to.be.reverted
      })
    })
  })
})
