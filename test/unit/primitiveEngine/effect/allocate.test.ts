import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei, Time, Wei } from 'web3-units'
import { parseEther } from '@ethersproject/units'

import expect from '../../.../../../shared/expect'
import { testContext } from '../../.../../../shared/testContext'
import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { engineFixture } from '../../.../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../.../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

const { HashZero } = constants

// for each calibration, run the tests
TestPools.forEach(function (pool: PoolState) {
  testContext(`allocate to ${pool.description} pool`, function () {
    // curve parameters
    const { decimalsRisky, decimalsStable } = pool.calibration
    // environment variables
    let poolId: string, delLiquidity: Wei, delRisky: Wei, delStable: Wei

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

      await useTokens(this.signers[0], this.contracts, pool.calibration) // mints tokens
      await useApproveAll(this.signers[0], this.contracts) // approves tokens
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration)) // calls create()
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address) // allocates liq

      const amount = parseWei('1000', 18)
      const res = await this.contracts.engine.reserves(poolId)
      delLiquidity = amount
      delRisky = amount.mul(res.reserveRisky).div(res.liquidity)
      delStable = amount.mul(res.reserveStable).div(res.liquidity)
    })

    describe('when allocating from margin', function () {
      beforeEach(async function () {
        await useMargin(
          this.signers[0],
          this.contracts,
          parseWei('1000').add(delRisky),
          parseWei('1000').add(delStable),
          this.contracts.router.address
        )
        poolId = pool.calibration.poolId(this.contracts.engine.address)
      })

      describe('success cases', function () {
        it('increases position liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.signers[1].address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, delLiquidity.raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('increases reserve risky', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('increases reserve stable', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(() =>
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
        })
      })

      describe('fail cases', function () {
        it('reverts if reserve.blockTimestamp is 0 (poolId not initialized)', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              HashZero,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if risky or stable margins are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              poolId,
              this.contracts.router.address,
              parseEther('1000000000'),
              delStable.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if there is no liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(
              HashZero,
              this.signers[0].address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if the deltas are 0', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', '0', HashZero)
          ).to.reverted
        })

        it('reverts if pool is expired', async function () {
          await this.contracts.engine.advanceTime(Time.YearInSeconds + 1)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[0].address, '0', '0', HashZero)
          ).to.reverted
        })
      })
    })

    describe('when allocating from external', function () {
      describe('success cases', function () {
        it('increases liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.contracts.router.address, poolId, delLiquidity.raw)
        })

        it('increases position liquidity of another recipient', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.signers[1].address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increasePositionLiquidity(this.contracts.engine, this.signers[1].address, poolId, delLiquidity.raw)
        })

        it('emits the Allocate event', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.emit(this.contracts.engine, 'Allocate')
        })

        it('increases reserve liquidity', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
        })

        it('increases reserve risky', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = parseWei('1').mul(res.reserveRisky).div(res.liquidity)
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
        })

        it('increases reserve stable', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = parseWei('1').mul(res.reserveStable).div(res.liquidity)
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
          ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
        })

        it('updates reserve timestamp', async function () {
          await expect(() =>
            this.contracts.router.allocateFromExternal(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
              delStable.raw,
              HashZero
            )
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
            delRisky.raw,
            delStable.raw,
            HashZero
          )

          expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(riskyBalance.sub(delRisky.raw))
          expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(
            stableBalance.sub(delStable.raw)
          )
        })
      })

      describe('fail cases', function () {
        it('reverts if risky are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNoRisky(
              poolId,
              this.contracts.router.address,
              parseWei('10').raw,
              delStable.raw,
              HashZero
            )
          ).to.be.reverted
        })

        it('reverts if stable are insufficient', async function () {
          await expect(
            this.contracts.router.allocateFromExternalNoStable(
              poolId,
              this.contracts.router.address,
              delRisky.raw,
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
              parseWei('1').raw,
              parseWei('1').raw,
              HashZero
            )
          ).to.be.reverted
        })
      })
    })
  })
})
