import { ethers } from 'hardhat'
import { parseWei } from 'web3-units'
import { constants, Wallet } from 'ethers'

import expect from '../../../shared/expect'
import { computePoolId } from '../../../shared/utils'
import { testContext } from '../../../shared/testContext'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`remove from ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, gamma, delta, decimalsRisky, decimalsStable } = pool.calibration
    let poolId: string

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(decimalsRisky, decimalsStable)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }

      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    const delLiquidity = parseWei('1')

    describe('when removing to margin', function () {
      beforeEach(async function () {
        poolId = computePoolId(
          this.contracts.engine.address,
          strike.toString(),
          sigma.toString(),
          maturity.toString(),
          gamma.toString()
        )
      })

      describe('success cases', function () {
        it('updates the margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.increaseMargin(this.contracts.engine, this.contracts.router.address, delRisky.raw, delStable.raw)
          const margin = await this.contracts.engine.margins(this.contracts.router.address)
          expect(margin.balanceRisky).to.equal(delRisky.raw)
          expect(margin.balanceStable).to.equal(delStable.raw)
        })

        it('pos.remove: decreases position liquidity', async function () {
          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.decreasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('res.remove: decreases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('res.remove: decrease reserve risky', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('res.remove: decrease reserve stable', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('res.remove: updates reserve block timestamp', async function () {
          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })

        it('res.remove: updates all reserve values', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

          await expect(() =>
            this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

          const updatedRes = await this.contracts.engine.reserves(poolId)
          expect(updatedRes.liquidity).to.equal(res.liquidity.sub(delLiquidity.raw))
          expect(updatedRes.reserveRisky).to.equal(res.reserveRisky.sub(delRisky.raw))
          expect(updatedRes.reserveStable).to.equal(res.reserveStable.sub(delStable.raw))
        })

        it('emits the Remove event', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

          await expect(this.contracts.router.removeToMargin(poolId, delLiquidity.raw, HashZero))
            .to.emit(this.contracts.engine, 'Remove')
            .withArgs(this.contracts.router.address, poolId, delRisky.raw, delStable.raw, delLiquidity.raw)
        })
      })

      describe('fail cases', function () {
        it('reverts if value pool does not exist', async function () {
          await expect(this.contracts.router.removeToMargin(HashZero, 0, HashZero)).to.be.reverted
        })

        it('reverts if desired liquidity to remove is more than position liquidity', async function () {
          const liq = await this.contracts.engine.liquidity(this.contracts.router.address, poolId)
          await expect(this.contracts.router.removeToMargin(poolId, liq.add(1), HashZero)).to.be.reverted
        })
      })
    })

    describe('when removing to external', function () {
      beforeEach(async function () {
        poolId = computePoolId(
          this.contracts.engine.address,
          strike.toString(),
          sigma.toString(),
          maturity.toString(),
          gamma.toString()
        )
      })

      describe('success cases', function () {
        it('transfers the risky to msg.sender', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [delRisky.raw])
        })

        it('transfers the stable to msg.sender', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.changeTokenBalances(this.contracts.stable, [this.signers[0]], [delStable.raw])
        })

        it('pos.remove: decreases position liquidity', async function () {
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.decreasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('res.remove: decreases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('res.remove: decrease reserve risky', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('res.remove: decrease reserve stable', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('res.remove: updates reserve block timestamp', async function () {
          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })

        it('res.remove: updates all reserve values', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

          await expect(() =>
            this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero)
          ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

          const updatedRes = await this.contracts.engine.reserves(poolId)
          expect(updatedRes.liquidity).to.equal(res.liquidity.sub(delLiquidity.raw))
          expect(updatedRes.reserveRisky).to.equal(res.reserveRisky.sub(delRisky.raw))
          expect(updatedRes.reserveStable).to.equal(res.reserveStable.sub(delStable.raw))
        })

        it('emits the Remove event', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

          await expect(this.contracts.router.removeToExternal(poolId, delLiquidity.raw, HashZero))
            .to.emit(this.contracts.engine, 'Remove')
            .withArgs(this.contracts.router.address, poolId, delRisky.raw, delStable.raw, delLiquidity.raw)
        })
      })

      describe('fail cases', function () {
        it('reverts if value pool does not exist', async function () {
          await expect(this.contracts.router.removeToExternal(HashZero, 0, HashZero)).to.be.reverted
        })

        it('reverts if remove amount is greater than position liquidity', async function () {
          const liq = await this.contracts.engine.liquidity(this.contracts.router.address, poolId)
          await expect(this.contracts.router.removeToExternal(poolId, liq.add(1), HashZero)).to.be.reverted
        })
      })
    })
  })
})
