import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike, BigNumber } from 'ethers'
import { parseWei, Wei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { createFragment } from '../fragments'
import { computePoolId } from '../../../shared/utils'
import { Config } from '../../config'

const { strike, sigma, maturity, lastTimestamp, spot, delta } = config
const empty: BytesLike = constants.HashZero
let poolId: string

describe('create', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'testPosition'], createFragment)
  })

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  })

  describe('success cases', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw)
    })

    it('emits the Created event', async function () {
      await expect(this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw))
        .to.emit(this.contracts.engine, 'Created')
        .withArgs(this.contracts.engineCreate.address, strike.raw, sigma.raw, maturity.raw)
    })

    it('updates the reserves of the engine', async function () {
      const tx = await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw)
      await tx.wait()
      const timestamp = lastTimestamp.raw

      const reserve = await this.contracts.engine.reserves(poolId)

      // TODO: Check RX1 and RY2

      expect(reserve.liquidity).to.equal(parseWei(1).raw)
      expect(reserve.float).to.equal(0)
      expect(reserve.debt).to.equal(0)
      expect(reserve.cumulativeLiquidity).to.not.equal(0)
      expect(reserve.cumulativeRisky).to.not.equal(0)
      expect(reserve.cumulativeStable).to.not.equal(0)
      expect(reserve.blockTimestamp).to.equal(timestamp)
    })

    it('updates the calibration struct', async function () {
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw)
      const settings = await this.contracts.engine.settings(poolId)

      // TODO: Improve this test
      expect(settings.lastTimestamp).to.not.equal(0)
    })
  })

  describe('fail cases', function () {
    it('reverts when the pool already exists', async function () {
      // set a new mock timestamp to create the pool with
      await this.contracts.engine.advanceTime(1)
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw)
      await expect(
        this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw)
      ).to.be.revertedWith('PoolDuplicateError()')
    })

    it('reverts if strike is 0', async function () {
      let fig = new Config(0, sigma.float, maturity.seconds, 1, spot.float)
      await expect(this.contracts.engine.create(fig.strike.raw, fig.sigma.raw, fig.maturity.raw, parseWei(fig.delta).raw)).to
        .reverted
    })

    /* it('reverts if sigma is 0', async function () {
      let fig = new Config(strike.float, 0, maturity.years, 1, spot.float)
      await expect(this.contracts.engine.create(fig.strike.raw, fig.sigma.raw, fig.maturity.raw, parseWei(fig.delta).raw)).to
        .reverted
    }) */

    it('reverts if maturity is 0', async function () {
      let fig = new Config(strike.float, sigma.float, 0, 1, spot.float)
      await expect(this.contracts.engine.create(fig.strike.raw, fig.sigma.raw, fig.maturity.raw, parseWei(fig.delta).raw)).to
        .reverted
    })

    it('reverts if the actual delta amounts are 0', async function () {
      // the amounts of tokens to transfer in are calculated from:
      // calculated Risky * deltaLiquidity / 1e18
      // therefore, if risk*delLiquidity < 1e18, delRisky would be 0. But this wouldn't cause a revert
      // must pass in > 1000 liquidity, since its subtracted from `allocate` call
      // additionally, skew the pool to be 99% risky by making it a deep OTM option, this will cause
      // the expected reserve stable to be close to 0 (but not 0),
      // which will cause our delStable to be calculated as 0, which it should not be
      let fig = new Config(100, sigma.float, maturity.seconds, 1, spot.float)
      let pid = computePoolId(this.contracts.engine.address, fig.maturity.raw, fig.sigma.raw, fig.strike.raw)
      await this.contracts.engineCreate.create(fig.strike.raw, sigma.raw, maturity.raw, parseWei(fig.delta).raw)
      const res = await this.contracts.engine.reserves(pid)
      expect(res.reserveStable.isZero()).to.eq(false)
    })
  })
})
