import expect from '../../.../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time } from 'web3-units'

import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../.../../../shared/utils'
import { primitiveFixture } from '../../.../../../shared/fixtures'
import { testContext } from '../../.../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../.../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`allocate to ${pool.description} pool`, function () {
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

    describe('when allocating from margin', function () {
      beforeEach(async function () {
        await useMargin(this.signers[0], this.contracts, parseWei('1000'), parseWei('1000'), this.contracts.router.address)
      })

      describe('success cases', function () {
        it('increases position liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, parseWei('1').raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[1].address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, parseWei('1').raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, parseWei('1').raw)
        })

        it('increases reserve risky', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = parseWei('1').mul(res.reserveRisky).div(res.liquidity)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('increases reserve stable', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = parseWei('1').mul(res.reserveStable).div(res.liquidity)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })
      })

      describe('fail cases', function () {
        it('reverts if reserve.blockTimestamp is 0 (poolId not initialized)', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              HashZero,
              this.contracts.router.address,
              parseWei('10000000').raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if risky or stable margins are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              parseWei('10000000').raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if there is no liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(HashZero, this.signers[0].address, parseWei('1').raw, HashZero)
          ).to.be.revertedWith('UninitializedError()')
        })

        it('reverts if the deltas are 0', async function () {
          await expect(this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', HashZero)).to.reverted
        })

        it('reverts if pool is expired', async function () {
          await this.contracts.engine.advanceTime(Time.YearInSeconds + 1)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', HashZero)
          ).to.revertedWith('PoolExpiredError()')
        })
      })
    })

    describe('when allocating from external', function () {
      describe('success cases', function () {
        it('increases liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, parseWei('1').raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.signers[1].address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, parseWei('1').raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, parseWei('1').raw)
        })

        it('increases reserve risky', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = parseWei('1').mul(res.reserveRisky).div(res.liquidity)
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('increases reserve stable', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = parseWei('1').mul(res.reserveStable).div(res.liquidity)
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })

        it('transfers the tokens', async function () {
          const reserve = await this.contracts.engine.reserves(poolId)

          const deltaX = parseWei('1').mul(reserve.reserveRisky).div(reserve.liquidity)
          const deltaY = parseWei('1').mul(reserve.reserveStable).div(reserve.liquidity)

          const riskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)
          const stableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)

          await this.contracts.router.allocateFromExternal(
            poolId,
            this.contracts.router.address,
            parseWei('1').raw,
            HashZero
          )

          expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(riskyBalance.sub(deltaX.raw))
          expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(stableBalance.sub(deltaY.raw))
        })
      })

      describe('fail cases', function () {
        it('reverts if risky are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNoRisky(
              poolId,
              this.contracts.router.address,
              parseWei('10').raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if stable are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNoStable(
              poolId,
              this.contracts.router.address,
              parseWei('10000').raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts on reentrancy', async function () {
          await expect(
            this.contracts.router.allocateFromExternalReentrancy(
              poolId,
              this.contracts.router.address,
              parseWei('10000').raw,
              HashZero
            )
          ).to.be.reverted
        })
      })
    })
  })
})
