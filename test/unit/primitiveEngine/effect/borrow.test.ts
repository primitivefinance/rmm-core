import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time, toBN } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin, useSupplyLiquidity } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`borrow from ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    const one = parseWei('1')
    let poolId: string, posId: string, beforeRes: any

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
      await useSupplyLiquidity(this.signers[0], this.contracts, pool.calibration, parseWei('1000').mul(7).div(10))

      beforeRes = await this.contracts.engine.positions(posId)
    })

    describe('success cases', async function () {
      it('pos.borrow: increases position collateralRisky', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.increasePositionDebt(this.contracts.engine, posId, one.raw, toBN('0'))
      })

      it('pos.borrow: increases position collateralStable', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
        ).to.increasePositionDebt(this.contracts.engine, posId, toBN('0'), strike.raw)
      })

      it('pos.borrow: increases position risky & stable collateral', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, strike.raw, HashZero)
        ).to.increasePositionDebt(this.contracts.engine, posId, one.raw, strike.raw)
      })

      it('res.borrowFloat: increases reserve collateral risky', async function () {
        const collateralRisky = one
        const collateralStable = strike
        const delLiquidity = collateralRisky.add(collateralStable.mul(1e18).div(strike))
        await expect(
          this.contracts.router.borrow(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            HashZero
          )
        ).to.increaseReserveCollateralRisky(this.contracts.engine, poolId, collateralRisky.raw)
      })

      it('res.borrowFloat: increases reserve collateral stable', async function () {
        const collateralRisky = one
        const collateralStable = strike
        const delLiquidity = collateralRisky.add(collateralStable.mul(1e18).div(strike))
        await expect(
          this.contracts.router.borrow(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            HashZero
          )
        ).to.increaseReserveCollateralStable(this.contracts.engine, poolId, collateralStable.raw)
      })

      it('res.borrowFloat: decreases reserve float', async function () {
        const collateralRisky = one
        const collateralStable = strike
        const delLiquidity = collateralRisky.add(collateralStable.mul(1e18).div(strike))
        await expect(
          this.contracts.router.borrow(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            HashZero
          )
        ).to.decreaseReserveFloat(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve liquidity', async function () {
        const collateralRisky = one
        const collateralStable = strike
        const delLiquidity = collateralRisky.add(collateralStable.mul(1e18).div(strike))
        await expect(
          this.contracts.router.borrow(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            HashZero
          )
        ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve risky from collateralRisky', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.decreaseReserveRisky(this.contracts.engine, poolId, delRisky)
      })

      it('res.remove: decreases reserve stable from collateralRisky', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable)
      })

      it('res.remove: decreases reserve risky from collateralStable', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const collateralStable = strike
        const delLiquidity = collateralStable.mul(1e18).div(strike)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity).raw
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', collateralStable.raw, HashZero)
        ).to.decreaseReserveRisky(this.contracts.engine, poolId, delRisky)
      })

      it('res.remove: decreases reserve stable from collateralStable', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const collateralStable = strike
        const delLiquidity = collateralStable.mul(1e18).div(strike)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity).raw
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', collateralStable.raw, HashZero)
        ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable)
      })

      it('res.feeRiskyGrowth: increases risky from fees', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delLiquidity = one
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity).raw
        const riskyDeficit = one.sub(delRisky)
        const fee = riskyDeficit.mul(30).div(1e4)
        const float = res.float
        const feeRiskyGrowth = fee.mul(parseWei(1).raw).div(float)
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.increaseReserveFeeRiskyGrowth(this.contracts.engine, poolId, feeRiskyGrowth.raw)
      })

      it('res.feeStableGrowth: increases stable from fees', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const collateralStable = strike
        const delLiquidity = collateralStable.mul(1e18).div(strike)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity).raw
        const stableDeficit = collateralStable.sub(delStable)
        const fee = stableDeficit.mul(30).div(1e4)
        const float = res.float
        const feeStableGrowth = fee.mul(parseWei(1).raw).div(float)
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', collateralStable.raw, HashZero)
        ).to.increaseReserveFeeStableGrowth(this.contracts.engine, poolId, feeStableGrowth.raw)
      })

      describe('from margin', function () {
        it('borrows collateralRisky using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const riskyDeficit = one.sub(delRisky)
          const fee = riskyDeficit.mul(30).div(1e4)
          const float = res.float
          const feeRiskyGrowth = fee.mul(parseWei(1).raw).div(float)
          await this.contracts.router.deposit(
            this.contracts.router.address,
            riskyDeficit.add(fee).raw,
            delStable.div(1e4),
            HashZero
          )
          await expect(
            this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, one.raw, '0', HashZero)
          ).to.decreaseMargin(
            this.contracts.engine,
            this.contracts.router.address,
            riskyDeficit.add(fee).raw,
            delStable.mul(-1)
          )
          let resAfter = await this.contracts.engine.reserves(poolId)
          await expect(resAfter.feeRiskyGrowth).to.be.eq(feeRiskyGrowth.raw)
        })

        it('increases fee growth on risky from borrow', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const riskyDeficit = one.sub(delRisky)
          const fee = riskyDeficit.mul(30).div(1e4)
          const float = res.float
          const feeRiskyGrowth = fee.mul(parseWei(1).raw).div(float)
          await this.contracts.router.deposit(
            this.contracts.router.address,
            riskyDeficit.add(fee).raw,
            delStable.div(1e4),
            HashZero
          )

          await expect(
            this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, one.raw, '0', HashZero)
          ).to.increaseReserveFeeRiskyGrowth(this.contracts.engine, poolId, feeRiskyGrowth.raw)
        })

        it('increases fee growth on stable from borrow', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const collateralStable = strike
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const stableDeficit = collateralStable.sub(delStable)
          const fee = stableDeficit.mul(30).div(1e4)
          const float = res.float
          const feeStableGrowth = fee.mul(parseWei(1).raw).div(float)
          await this.contracts.router.deposit(this.contracts.router.address, delRisky, stableDeficit.add(fee).raw, HashZero)

          await expect(
            this.contracts.router.borrowWithMargin(
              poolId,
              this.contracts.router.address,
              '0',
              collateralStable.raw,
              HashZero
            )
          ).to.increaseReserveFeeStableGrowth(this.contracts.engine, poolId, feeStableGrowth.raw)
        })

        it('borrows collateralStable using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const stableDeficit = strike
            .sub(delStable)
            .mul(1e4 + 30)
            .div(1e4).raw
          await this.contracts.router.deposit(
            this.contracts.router.address,
            delRisky,
            stableDeficit.mul(1e4 + 30).div(1e4),
            HashZero
          )
          await expect(
            this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
          ).to.decreaseMargin(this.contracts.engine, this.contracts.router.address, delRisky.mul(-1), stableDeficit)
        })

        it('borrows risky & stable collateral using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delLiquidity = one.add(strike.mul(1e18).div(strike))
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity).raw
          const riskyDeficit = one
            .sub(delRisky)
            .mul(1e4 + 30)
            .div(1e4)
          const stableDeficit = strike
            .sub(delStable)
            .mul(1e4 + 30)
            .div(1e4)

          await this.contracts.router.deposit(this.contracts.router.address, riskyDeficit.raw, stableDeficit.raw, HashZero)

          await expect(
            this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, one.raw, strike.raw, HashZero)
          ).to.decreaseMargin(this.contracts.engine, this.contracts.router.address, riskyDeficit.raw, stableDeficit.raw)
        })
      })

      it('msg.sender receives stable tokens from removed liquidity', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(() =>
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.changeTokenBalances(this.contracts.stable, [this.signers[0]], [delStable])
      })

      it('msg.sender receives risky tokens from removed liquidity', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        await expect(() =>
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [delRisky])
      })

      it('engine receives risky token surplus', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        const riskySurplus = one
          .sub(delRisky)
          .mul(1e4 + 30)
          .div(1e4).raw
        await expect(() =>
          this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.changeTokenBalances(this.contracts.risky, [this.contracts.engine], [riskySurplus])
      })

      it('engine receives stable token surplus', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        const stableSurplus = strike
          .sub(delStable)
          .mul(1e4 + 30)
          .div(1e4).raw
        await expect(() =>
          this.contracts.router.borrow(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.stable, [this.contracts.engine], [stableSurplus])
      })

      describe('borrows then repays, losing the fee paid in borrow', function () {
        it('repays a long option position with risky collateral, earning the proceeds', async function () {
          await this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero) // spends premium
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity)
          const riskySurplus = one.sub(delRisky)

          await expect(() =>
            this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
          ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [riskySurplus.raw])
        })

        it('repays a long option position with stable collateral, earning the proceeds', async function () {
          const collateralStable = strike
          await this.contracts.router.borrow(poolId, this.contracts.router.address, '0', collateralStable.raw, HashZero) // spends premium
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = one.mul(res.reserveStable).div(res.liquidity)
          const stableSurplus = collateralStable.sub(delStable)

          await expect(() =>
            this.contracts.router.repay(poolId, this.contracts.router.address, '0', collateralStable.raw, false, HashZero)
          ).to.changeTokenBalances(this.contracts.stable, [this.signers[0]], [stableSurplus.raw])
        })
      })

      it('emits the Borrowed event', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.mul(res.reserveRisky).div(res.liquidity)
        const delStable = one.mul(res.reserveStable).div(res.liquidity)
        await expect(this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero))
          .to.emit(this.contracts.engine, 'Borrowed')
          .withArgs(
            this.contracts.router.address,
            poolId,
            one.raw,
            '0',
            one
              .sub(delRisky)
              .mul(1e4 + 30)
              .div(1e4).raw, // riskyDeficit
            '0', // riskySurplus
            '0', // stableDeficit
            delStable.raw // stableSurplus
          )
      })
    })

    describe('fail cases', async function () {
      it('reverts if both risky & stable collateral amounts are 0', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, toBN(0), toBN(0), HashZero)
        ).to.be.reverted
      })
      it('fails to originate more long option positions than are allocated to float', async function () {
        await expect(
          this.contracts.router.borrow(poolId, this.contracts.router.address, parseWei('2000').raw, toBN(0), HashZero)
        ).to.be.reverted
      })

      it('fails to originate 1 long option, because no tokens were paid for risky deficit', async function () {
        await expect(
          this.contracts.router.borrowWithoutPaying(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.be.reverted
      })

      it('fails to originate 1 long option, because no tokens were paid for stable deficit', async function () {
        await expect(
          this.contracts.router.borrowWithoutPaying(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
        ).to.be.reverted
      })

      it('fails to borrow from margin because not enough risky in margin', async function () {
        await expect(
          this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        ).to.be.reverted
      })

      it('fails to borrow from margin because not enough stable in margin', async function () {
        await expect(
          this.contracts.router.borrowWithMargin(poolId, this.contracts.router.address, '0', strike.raw, HashZero)
        ).to.be.reverted
      })
    })
  })
})
