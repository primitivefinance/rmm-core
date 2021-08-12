import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike, BigNumber, Wallet } from 'ethers'
import { parseWei, Wei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId, Calibration } from '../../../shared'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, lastTimestamp, spot, delta } = config
const empty: BytesLike = constants.HashZero

export async function beforeEachCreate(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
}

describe('create', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'testPosition'], beforeEachCreate)
  })

  let poolId: string
  let delLiquidity = parseWei(0)

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    delLiquidity = parseWei(1)
  })

  describe('success cases', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        empty
      )
    })

    it('emits the Created event', async function () {
      await expect(
        this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, delLiquidity.raw, empty)
      )
        .to.emit(this.contracts.engine, 'Created')
        .withArgs(this.contracts.engineCreate.address, strike.raw, sigma.raw, maturity.raw)
    })

    it('updates the reserves of the engine', async function () {
      const tx = await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        empty
      )
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
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        empty
      )
      const calibrations = await this.contracts.engine.calibrations(poolId)

      // TODO: Improve this test
      expect(calibrations.lastTimestamp).to.not.equal(0)
    })
  })

  describe('fail cases', function () {
    it('reverts when the pool already exists', async function () {
      // set a new mock timestamp to create the pool with
      await this.contracts.engine.advanceTime(1)
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        empty
      )
      await expect(
        this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, delLiquidity.raw, empty)
      ).to.be.revertedWith('PoolDuplicateError()')
    })

    it('reverts if strike is 0', async function () {
      let fig = new Calibration(0, sigma.float, maturity.seconds, 1, spot.float)
      await expect(
        this.contracts.engine.create(
          fig.strike.raw,
          fig.sigma.raw,
          fig.maturity.raw,
          parseWei(fig.delta).raw,
          delLiquidity.raw,
          empty
        )
      ).to.reverted
    })

    /* it('reverts if sigma is 0', async function () {
      let fig = new Calibration(strike.float, 0, maturity.years, 1, spot.float)
      await expect(this.contracts.engine.create(fig.strike.raw, fig.sigma.raw, fig.maturity.raw, parseWei(fig.delta).raw), delLiquidity.raw, empty).to
        .reverted
    }) */

    it('reverts if maturity is 0', async function () {
      let fig = new Calibration(strike.float, sigma.float, 0, 1, spot.float)
      await expect(
        this.contracts.engine.create(
          fig.strike.raw,
          fig.sigma.raw,
          fig.maturity.raw,
          parseWei(fig.delta).raw,
          delLiquidity.raw,
          empty
        )
      ).to.reverted
    })

    it('reverts if the actual delta amounts are 0', async function () {
      // the amounts of tokens to transfer in are calculated from:
      // calculated Risky * deltaLiquidity / 1e18
      // therefore, if risk*delLiquidity < 1e18, delRisky would be 0. But this wouldn't cause a revert
      // must pass in > 1000 liquidity, since its subtracted from `allocate` call
      // additionally, skew the pool to be 99% risky by making it a deep OTM option, this will cause
      // the expected reserve stable to be close to 0 (but not 0),
      // which will cause our delStable to be calculated as 0, which it should not be
      let fig = new Calibration(100, sigma.float, maturity.seconds, 1, spot.float)
      let pid = computePoolId(this.contracts.engine.address, fig.maturity.raw, fig.sigma.raw, fig.strike.raw)
      await this.contracts.engineCreate.create(
        fig.strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(fig.delta).raw,
        delLiquidity.raw,
        empty
      )
      const res = await this.contracts.engine.reserves(pid)
      expect(res.reserveStable.isZero()).to.eq(false)
    })
  })
})
