import expect from '../../../shared/expect'
import { constants } from 'ethers'
import { parseWei } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`supply to ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    let poolId: string, posId: string
    const one = parseWei('1')

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
    })

    describe('success cases', function () {
      it('res.addFloat: adds 1 liquidity share to reserve float', async function () {
        await expect(this.contracts.router.supply(poolId, one.raw)).to.increaseReserveFloat(
          this.contracts.engine,
          poolId,
          one.raw
        )
      })

      it('pos.supply: adds 1 liquidity share to position float', async function () {
        await expect(this.contracts.router.supply(poolId, one.raw)).to.increasePositionFloat(
          this.contracts.engine,
          posId,
          one.raw
        )
      })

      describe('supply after borrow revenue', function () {
        it('pos.supply: adds 1 liquidity after borrow fee risky revenue has accrued', async function () {
          // supply first
          await this.contracts.router.supply(poolId, parseWei('2').raw)
          // calculate the expected borrow fees
          const res = await this.contracts.engine.reserves(poolId)
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
          await expect(this.contracts.router.supply(poolId, one.raw)).to.increasePositionFeeRiskyGrowthLast(
            this.contracts.engine,
            posId,
            feeRiskyGrowth.raw
          )
        })

        it('pos.supply: adds 1 liquidity after borrow fee stable revenue has accrued', async function () {
          // supply first
          await this.contracts.router.supply(poolId, parseWei('2').raw)
          // calculate the expected borrow fees
          const res = await this.contracts.engine.reserves(poolId)
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
          await expect(this.contracts.router.supply(poolId, one.raw)).to.increasePositionFeeStableGrowthLast(
            this.contracts.engine,
            posId,
            feeStableGrowth.raw
          )
        })
      })
    })

    describe('fail cases', function () {
      it('fails to add 0 liquidity', async function () {
        await expect(this.contracts.router.supply(poolId, parseWei('0').raw)).to.be.revertedWith('LiquidityError()')
      })

      it('fails to add more to float than is available in the position liquidity', async function () {
        await expect(this.contracts.router.supply(poolId, parseWei('20').raw)).to.be.reverted
      })

      it('fails to remove liquidity after supplying it to float', async function () {
        let pos = await this.contracts.engine.positions(posId)
        const amt = pos.liquidity.mul(8).div(10)
        await this.contracts.router.supply(poolId, amt)
        await expect(this.contracts.router.remove(poolId, amt, HashZero)).to.be.reverted
      })

      it('fails to add liquidity to float above liquidity factor of 80%', async function () {
        let pos = await this.contracts.engine.positions(posId)
        await expect(this.contracts.router.supply(poolId, pos.liquidity)).to.be.reverted
      })
    })
  })
})
