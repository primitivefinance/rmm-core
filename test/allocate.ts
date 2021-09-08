import expect from './shared/expect'
import { waffle } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei, Time } from 'web3-units'

import { DEFAULT_CONFIG as config } from './unit/context'
import { computePoolId, computePositionId } from './shared/utils'
import { Contracts } from '../types'
import { primitiveFixture, PrimitiveFixture } from './shared/fixtures'
import { batchApproval, Calibration } from './shared'
import { testContext } from './shared/testContext'

//const { strike, sigma, maturity, lastTimestamp, delta } = config
const { HashZero } = constants

export async function beforeEachAllocate(signers: Wallet[], contracts: Contracts, conf: Calibration): Promise<void> {
  const contractAddresses = Object.keys(contracts).map((key) => contracts[key]?.address)
  const { strike, sigma, maturity, lastTimestamp, delta } = conf

  await batchApproval(contractAddresses, [contracts.risky, contracts.stable], signers[0])
  await contracts.stable.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.approve(contracts.router.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.router.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.router.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.router.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.router.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.router.address, constants.MaxUint256)

  await contracts.router.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  await contracts.router.allocateFromExternal(poolId, signers[0].address, parseWei('100').raw, HashZero)
}

;[config, config].forEach(function (conf) {
  testContext('allocate', function () {
    let poolId: string, posId: string, fixture: PrimitiveFixture
    const { strike, sigma, maturity, lastTimestamp, delta } = conf
    beforeEach(async function () {
      fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts

      poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
      posId = await this.contracts.router.getPosition(poolId)
      await beforeEachAllocate(this.signers, this.contracts, conf)
    })

    describe('when allocating from margin', function () {
      beforeEach(async function () {
        await this.contracts.router.deposit(
          this.contracts.router.address,
          parseWei('1000').raw,
          parseWei('1000').raw,
          HashZero
        )
      })

      describe('success cases', function () {
        it('increases position liquidity', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, posId, parseWei('1').raw)
        })

        it('increases position liquidity of another recipient', async function () {
          const recipientPosId = computePositionId(this.signers[1].address, poolId)
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.signers[1].address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, recipientPosId, parseWei('1').raw)
        })

        it('emits the Allocated event', async function () {
          await expect(
            this.contracts.router.allocateFromMargin(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.emit(this.contracts.engine, 'Allocated')
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
          ).to.increasePositionLiquidity(this.contracts.engine, posId, parseWei('1').raw)
        })

        it('increases position liquidity of another recipient', async function () {
          const recipientPosId = computePositionId(this.signers[1].address, poolId)
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.signers[1].address, parseWei('1').raw, HashZero)
          ).to.increasePositionLiquidity(this.contracts.engine, recipientPosId, parseWei('1').raw)
        })

        it('emits the Allocated event', async function () {
          await expect(
            this.contracts.router.allocateFromExternal(poolId, this.contracts.router.address, parseWei('1').raw, HashZero)
          ).to.emit(this.contracts.engine, 'Allocated')
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
