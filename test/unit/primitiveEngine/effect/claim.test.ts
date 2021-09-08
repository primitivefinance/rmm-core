import expect from '../../../shared/expect'
import { constants } from 'ethers'
import { parseWei } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useSupplyLiquidity } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`claim from ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    const one = parseWei('1')
    let poolId: string, posId: string

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
      await useSupplyLiquidity(this.signers[0], this.contracts, pool.calibration, parseWei('1000').mul(8).div(10))
    })

    describe('success cases', function () {
      it('res.removeFloat: removes 1 liquidity share from reserve float', async function () {
        await expect(this.contracts.router.claim(poolId, one.raw)).to.decreaseReserveFloat(
          this.contracts.engine,
          poolId,
          one.raw
        )
      })

      it('pos.claim: removes 1 liquidity share from position float', async function () {
        await expect(this.contracts.router.claim(poolId, one.raw)).to.decreasePositionFloat(
          this.contracts.engine,
          posId,
          one.raw
        )
      })

      describe('claim after borrow revenue', function () {
        it('pos.claim: removes 1 liquidity after borrow fee risky revenue has accrued', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          // calculate the expected borrow fees
          const delLiquidity = one
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const riskyDeficit = delLiquidity.sub(delRisky)
          const fee = riskyDeficit.mul(30).div(1e4)
          const feeRiskyGrowth = fee.mul(one).div(res.float)
          // borrow the position, generating revenue
          await this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
          // repay the position to release the float
          await this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
          // claim the float back, withdrawing the generated borrow fees
          await expect(this.contracts.router.claim(poolId, one.raw)).to.increasePositionFeeRiskyGrowthLast(
            this.contracts.engine,
            posId,
            feeRiskyGrowth.raw
          )
        })

        it('pos.claim: removes 1 liquidity after borrow fee stable revenue has accrued', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          // calculate the expected borrow fees
          const collateralStable = strike
          const delLiquidity = collateralStable.mul(one).div(strike)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
          const stableDeficit = collateralStable.sub(delStable)
          const fee = stableDeficit.mul(30).div(1e4)
          const feeStableGrowth = fee.mul(one).div(res.float)
          // borrow the position, generating revenue
          await this.contracts.router.borrow(poolId, this.contracts.router.address, '0', collateralStable.raw, HashZero)
          // repay the position to release the float
          await this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            '0',
            collateralStable.raw,
            false,
            HashZero
          )
          // claim the float back, withdrawing the generated borrow fees
          await expect(this.contracts.router.claim(poolId, one.raw)).to.increasePositionFeeStableGrowthLast(
            this.contracts.engine,
            posId,
            feeStableGrowth.raw
          )
        })
      })
    })

    describe('fail cases', function () {
      it('fails to remove 0 liquidity', async function () {
        await expect(this.contracts.router.claim(poolId, parseWei('0').raw)).to.be.revertedWith('LiquidityError()')
      })

      it('fails to remove more to float than is available in the position liquidity', async function () {
        const float = (await this.contracts.engine.positions(posId)).float
        await expect(this.contracts.router.claim(poolId, float)).to.be.reverted
      })
      it('fails to remove more to float than is available in the __GLOBAL FLOAT__', async function () {
        const float = (await this.contracts.engine.positions(posId)).float
        await this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        await expect(this.contracts.router.claim(poolId, float)).to.be.reverted
      })
    })
  })
})
