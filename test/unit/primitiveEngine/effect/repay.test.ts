import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time, Wei, toBN } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`repay to ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    let poolId: string, posId: string
    let collateralRisky: Wei, collateralStable: Wei, delLiquidity: Wei
    const one = parseWei('1')

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
      collateralRisky = parseWei('1', pool.calibration.precisionRisky)
      collateralStable = strike
      delLiquidity = collateralRisky.mul(Math.pow(10, 18 - collateralRisky.decimals)).add(
        collateralStable
          .mul(collateralStable.decimals)
          .div(strike)
          .mul(Math.pow(10, 18 - collateralStable.decimals))
      )
    })

    describe('success cases', function () {
      it('reduces the collateralRisky of the position', async function () {
        await expect(
          this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
        ).to.decreasePositionDebt(this.contracts.engine, posId, one.raw, toBN(0))
        const position = await this.contracts.engine.positions(posId)
        expect(position.collateralRisky).to.equal(0)
      })

      it('reduces the collateralStable of the position', async function () {
        await expect(
          this.contracts.router.repay(poolId, this.contracts.router.address, '0', strike.raw, false, HashZero)
        ).to.decreasePositionDebt(this.contracts.engine, posId, toBN(0), strike.raw)
        const position = await this.contracts.engine.positions(posId)
        expect(position.collateralStable).to.equal(0)
      })

      it('res.allocate: increases risky reserve', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
      })

      it('res.allocate: increases stable reserve', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
      })

      it('res.allocate: increases reserve liquidity', async function () {
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.allocate: updates reserve blocktimestamp', async function () {
        await expect(
          this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
        ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
      })

      it('allocates to the reserve and updates all its values', async function () {
        const oldReserve = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const delStable = delLiquidity.mul(oldReserve.reserveStable).div(oldReserve.liquidity)

        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

        const newReserve = await this.contracts.engine.reserves(poolId)

        expect(newReserve.reserveRisky).to.equal(oldReserve.reserveRisky.add(delRisky.raw))
        expect(newReserve.reserveStable).to.equal(oldReserve.reserveStable.add(delStable.raw))
        expect(newReserve.liquidity).to.equal(oldReserve.liquidity.add(delLiquidity.raw))
      })

      it('res.repayFloat: decreases reserve collateral risky', async function () {
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.decreaseReserveCollateralRisky(this.contracts.engine, poolId, collateralRisky.raw)
      })

      it('res.repayFloat: decreases reserve collateral stable', async function () {
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.decreaseReserveCollateralStable(this.contracts.engine, poolId, collateralStable.raw)
      })

      it('res.repayFloat: increases reserve float', async function () {
        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveFloat(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('reduces the debt and increases the float of the reserve', async function () {
        const oldReserve = await this.contracts.engine.reserves(poolId)

        await expect(
          this.contracts.router.repay(
            poolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            false,
            HashZero
          )
        ).to.increaseReserveFloat(this.contracts.engine, poolId, delLiquidity.raw)

        const newReserve = await this.contracts.engine.reserves(poolId)
        expect(newReserve.float).to.equal(oldReserve.float.add(delLiquidity.raw))
        expect(newReserve.collateralRisky).to.equal(oldReserve.collateralRisky.sub(collateralRisky.raw))
        expect(newReserve.collateralStable).to.equal(oldReserve.collateralStable.sub(collateralStable.raw))
      })

      it('emits the Repaid event', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.mul(res.reserveRisky).div(res.liquidity)
        const delStable = one.mul(res.reserveStable).div(res.liquidity)
        await expect(this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero))
          .to.emit(this.contracts.engine, 'Repaid')
          .withArgs(
            this.contracts.router.address,
            this.contracts.router.address,
            poolId,
            one.raw,
            '0',
            '0', // riskyDeficit
            one.sub(delRisky).raw, // riskySurplus
            delStable.raw, // stableDeficit
            '0' // stableSurplus
          )
      })

      describe('when from margin', function () {
        it('reduces stable in margin by delStable, increases risky in margin by premium', async function () {
          await this.contracts.router.deposit(this.contracts.router.address, 0, parseWei('400').raw, HashZero)

          const oldReserve = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
          const delStable = one.mul(oldReserve.reserveStable).div(oldReserve.liquidity)
          const premium = one.sub(delRisky)

          const margin = await this.contracts.engine.margins(this.contracts.router.address)

          await expect(
            this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', true, HashZero)
          ).to.decreaseMargin(this.contracts.engine, this.contracts.router.address, premium.raw.mul(-1), delStable.raw)

          const newMargin = await this.contracts.engine.margins(this.contracts.router.address)

          expect(newMargin.balanceStable).to.equal(margin.balanceStable.sub(delStable.raw))
          expect(newMargin.balanceRisky).to.equal(margin.balanceRisky.add(premium.raw))
        })
      })

      describe('when from external', function () {
        it('transfers the risky surplus to the caller of repay', async function () {
          const previousRiskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)

          const oldReserve = await this.contracts.engine.reserves(poolId)
          // div delLiquidity by 2 because we are only liquidating 1 collateralRisky = 1 unit of debt
          const delRisky = delLiquidity.div(2).mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
          const riskySurplus = collateralRisky.sub(delRisky)

          await expect(() =>
            this.contracts.router.repay(poolId, this.contracts.router.address, collateralRisky.raw, '0', false, HashZero)
          ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [riskySurplus.raw])

          expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(
            previousRiskyBalance.add(riskySurplus.raw)
          )
        })

        it('transfers the stable deficit from the caller to the engine', async function () {
          const signerPreviousStableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)
          const enginePreviousStableBalance = await this.contracts.stable.balanceOf(this.contracts.engine.address)

          const oldReserve = await this.contracts.engine.reserves(poolId)
          // div delLiquidity by 2 because we are only liquidating 1 collateralRisky = 1 unit of debt
          const delStable = delLiquidity.div(2).mul(oldReserve.reserveStable).div(oldReserve.liquidity)
          const stableDeficit = delStable

          await expect(() =>
            this.contracts.router.repay(poolId, this.contracts.router.address, collateralRisky.raw, '0', false, HashZero)
          ).to.changeTokenBalances(this.contracts.stable, [this.contracts.engine], [stableDeficit.raw])

          expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(
            signerPreviousStableBalance.sub(stableDeficit.raw)
          )

          expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.equal(
            enginePreviousStableBalance.add(stableDeficit.raw)
          )
        })
      })

      describe('when expired', function () {
        let expiredPoolId: string
        beforeEach(async function () {
          const fig = new Calibration(10, 1, Time.YearInSeconds, Time.YearInSeconds + 1, 10)
          await this.contracts.router.create(
            fig.strike.raw,
            fig.sigma.raw,
            fig.maturity.raw,
            parseWei(fig.delta).raw,
            one.raw,
            HashZero
          )
          expiredPoolId = computePoolId(this.contracts.engine.address, fig.maturity.raw, fig.sigma.raw, fig.strike.raw)
          const gracePeriod = 60 * 60 * 24
          // give liquidity to router contract
          await this.contracts.router.allocateFromExternal(
            expiredPoolId,
            this.contracts.router.address,
            parseWei('100').raw,
            HashZero
          )
          // have the router contract supply the lp shares
          await this.contracts.router.supply(expiredPoolId, parseWei('100').mul(5).div(10).raw)
          // have the router borrow the lp shares
          await this.contracts.router.borrow(
            expiredPoolId,
            this.contracts.router.address,
            collateralRisky.raw,
            collateralStable.raw,
            HashZero
          )
          await this.contracts.engine.advanceTime(Time.YearInSeconds + 1 + gracePeriod)
        })

        it('repay router`s collateralRisky position, receive riskySurplus and pay stable deficit', async function () {
          const oldReserve = await this.contracts.engine.reserves(expiredPoolId)
          const delRisky = delLiquidity.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
          const delStable = delLiquidity.mul(oldReserve.reserveStable).div(oldReserve.liquidity)

          let riskyDeficit = parseWei(0)
          let riskySurplus = parseWei(0)
          let stableDeficit = parseWei(0)
          let stableSurplus = parseWei(0)

          if (collateralRisky.gt(delRisky)) riskySurplus = collateralRisky.sub(delRisky)
          else riskyDeficit = delRisky.sub(collateralRisky)
          if (collateralRisky.gt(delRisky)) stableSurplus = collateralStable.sub(delStable)
          else stableDeficit = delStable.sub(collateralStable)

          riskySurplus = riskySurplus
          stableSurplus = stableSurplus

          await this.contracts.router.deposit(this.contracts.router.address, 0, stableDeficit.raw, HashZero)
          await expect(
            this.contracts.router.repay(
              expiredPoolId,
              this.contracts.router.address,
              collateralRisky.raw,
              collateralStable.raw,
              true,
              HashZero
            )
          ).to.decreaseMargin(
            this.contracts.engine,
            this.contracts.router.address,
            riskySurplus.mul(-1).add(riskyDeficit).raw,
            stableSurplus.mul(-1).add(stableDeficit).raw
          )
        })
      })
    })

    describe('fail cases', function () {
      it('reverts if no debt', async function () {
        await this.contracts.router.repay(
          poolId,
          this.contracts.router.address,
          collateralRisky.raw,
          collateralStable.raw,
          false,
          HashZero
        )
        await expect(
          this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
        ).to.be.reverted
      })

      it('reverts if repaying another account before maturity', async function () {
        await this.contracts.router.allocateFromExternal(poolId, this.signers[0].address, parseWei('100').raw, HashZero)
        await this.contracts.engine.supply(poolId, parseWei('100').mul(8).div(10).raw)
        await this.contracts.router.borrow(poolId, this.contracts.router.address, one.raw, '0', HashZero)
        await this.contracts.router.deposit(this.signers[0].address, parseWei('100').raw, parseWei('100').raw, HashZero)
        await expect(
          this.contracts.engine.repay(poolId, this.contracts.router.address, one.raw, '0', true, HashZero)
        ).to.be.reverted
      })

      describe('when from margin', function () {
        it('reverts if the stable balance of the margin is not sufficient', async function () {
          await expect(
            this.contracts.router.repay(poolId, this.contracts.router.address, one.raw, '0', true, HashZero)
          ).to.be.reverted
        })
      })

      describe('when from external', function () {
        it('reverts if stable was not paid in callback', async function () {
          await expect(
            this.contracts.router.repayWithoutRepaying(poolId, this.contracts.router.address, one.raw, '0', false, HashZero)
          ).to.be.reverted
        })
      })
    })
  })
})
