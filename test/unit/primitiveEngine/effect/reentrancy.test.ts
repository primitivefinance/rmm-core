import { parseWei } from 'web3-units'
import { constants, Wallet } from 'ethers'

import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { customDecimalsFixture, PrimitiveFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'

const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`reentrancy attacks on ${pool.description} pool`, function () {
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

    describe('when calling deposit in the deposit callback', function () {
      it('reverts the transaction', async function () {
        await expect(
          this.contracts.router.depositReentrancy(
            this.signers[0].address,
            parseWei('1').raw,
            parseWei('1').raw,
            HashZero
          )
        ).to.be.reverted
      })
    })

    describe('when calling allocate in the allocate callback', function () {
      it('reverts the transaction', async function () {
        const amount = parseWei('1')
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = amount.mul(res.reserveRisky).div(res.liquidity)
        const delStable = amount.mul(res.reserveStable).div(res.liquidity)
        await expect(
          this.contracts.router.allocateFromExternalReentrancy(
            poolId,
            this.signers[0].address,
            delRisky.raw,
            delStable.raw,
            HashZero
          )
        ).to.be.reverted
      })
    })
  })
})
