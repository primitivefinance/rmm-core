import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { parseWei } from 'web3-units'
import { BigNumber, constants, Wallet } from 'ethers'

import { computePoolId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
const { strike, sigma, maturity, lastTimestamp, delta } = config
const { HashZero } = constants

export async function beforeEachRemove(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineRemove.address, parseWei('10').raw, HashZero)
}

describe('remove', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineRemove'], beforeEachRemove)
  })

  const delLiquidity = parseWei('1')
  let poolId: string
  let posId: string

  describe('when removing to margin', function () {
    beforeEach(async function () {
      poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
      posId = await this.contracts.engineRemove.getPosition(poolId)
    })

    describe('success cases', function () {
      it('updates the margin', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

        await expect(this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)).to.increaseMargin(
          this.contracts.engine,
          this.contracts.engineRemove.address,
          delRisky.raw,
          delStable.raw
        )
        const margin = await this.contracts.engine.margins(this.contracts.engineRemove.address)
        expect(margin.balanceRisky).to.equal(delRisky.raw)
        expect(margin.balanceStable).to.equal(delStable.raw)
      })

      it('pos.remove: decreases position liquidity', async function () {
        await expect(
          this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)
        ).to.decreasePositionLiquidity(this.contracts.engine, posId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve liquidity', async function () {
        await expect(
          this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decrease reserve risky', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        await expect(this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)).to.decreaseReserveRisky(
          this.contracts.engine,
          poolId,
          delRisky.raw
        )
      })

      it('res.remove: decrease reserve stable', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
        await expect(
          this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable.raw)
      })

      it('res.remove: updates reserve block timestamp', async function () {
        await expect(
          this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)
        ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
      })

      it('res.remove: updates all reserve values', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

        await expect(
          this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

        const updatedRes = await this.contracts.engine.reserves(poolId)
        expect(updatedRes.liquidity).to.equal(res.liquidity.sub(delLiquidity.raw))
        expect(updatedRes.reserveRisky).to.equal(res.reserveRisky.sub(delRisky.raw))
        expect(updatedRes.reserveStable).to.equal(res.reserveStable.sub(delStable.raw))
      })

      it('emits the Removed event', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

        await expect(this.contracts.engineRemove.removeToMargin(poolId, delLiquidity.raw, HashZero))
          .to.emit(this.contracts.engine, 'Removed')
          .withArgs(this.contracts.engineRemove.address, poolId, delRisky.raw, delStable.raw)
      })
    })

    describe('fail cases', function () {
      it('reverts if value is 0', async function () {
        await expect(this.contracts.engineRemove.removeToMargin(poolId, 0, HashZero)).to.be.reverted
      })

      it('reverts if desired liquidity to remove is more than position liquidity', async function () {
        await expect(this.contracts.engineRemove.removeToMargin(poolId, parseWei('11').raw, HashZero)).to.be.reverted
      })
    })
  })

  describe('when removing to external', function () {
    beforeEach(async function () {
      poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
      posId = await this.contracts.engineRemove.getPosition(poolId)
    })

    describe('success cases', function () {
      it('transfers the risky to msg.sender', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        await expect(() =>
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [delRisky.raw])
      })

      it('transfers the stable to msg.sender', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
        await expect(() =>
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.stable, [this.signers[0]], [delStable.raw])
      })

      it('pos.remove: decreases position liquidity', async function () {
        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.decreasePositionLiquidity(this.contracts.engine, posId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve liquidity', async function () {
        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decrease reserve risky', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
      })

      it('res.remove: decrease reserve stable', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveStable(this.contracts.engine, poolId, delStable.raw)
      })

      it('res.remove: updates reserve block timestamp', async function () {
        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
      })

      it('res.remove: updates all reserve values', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

        await expect(
          this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero)
        ).to.decreaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

        const updatedRes = await this.contracts.engine.reserves(poolId)
        expect(updatedRes.liquidity).to.equal(res.liquidity.sub(delLiquidity.raw))
        expect(updatedRes.reserveRisky).to.equal(res.reserveRisky.sub(delRisky.raw))
        expect(updatedRes.reserveStable).to.equal(res.reserveStable.sub(delStable.raw))
      })

      it('emits the Removed event', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

        await expect(this.contracts.engineRemove.removeToExternal(poolId, delLiquidity.raw, HashZero))
          .to.emit(this.contracts.engine, 'Removed')
          .withArgs(this.contracts.engineRemove.address, poolId, delRisky.raw, delStable.raw)
      })
    })

    describe('fail cases', function () {
      it('reverts if value is 0', async function () {
        await expect(this.contracts.engineRemove.removeToExternal(poolId, 0, HashZero)).to.be.reverted
      })

      it('reverts if remove amount is greater than position liquidity', async function () {
        await expect(this.contracts.engineRemove.removeToExternal(poolId, parseWei('11').raw, HashZero)).to.be.reverted
      })
    })
  })
})
