import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { parseWei } from 'web3-units'
import { constants, BytesLike, Wallet, BigNumber } from 'ethers'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId, Calibration, computePositionId } from '../../../shared'
import { Contracts } from '../../../../types'
import { getStableGivenRisky } from '@primitivefinance/v2-math'

const { strike, sigma, maturity, lastTimestamp, spot, delta } = config
const { HashZero } = constants

export async function beforeEachCreate(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
}

describe('create', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'testPosition'], beforeEachCreate)
  })

  let poolId: string, posId: string
  let delLiquidity = parseWei(0)

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    posId = computePositionId(this.contracts.engineCreate.address, poolId)
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
        HashZero
      )
    })

    it('res.allocate: increases reserve liquidity', async function () {
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
    })

    it('res.allocate: increases reserve risky', async function () {
      const delRisky = parseWei(1 - delta)
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
    })

    it('res.allocate: increases reserve stable', async function () {
      const delRisky = parseWei(1 - delta)
      const delStable = parseWei(
        getStableGivenRisky(delRisky.float, strike.float, sigma.float, maturity.sub(lastTimestamp).years)
      )
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
    })

    it('res.allocate: update block timestamp', async function () {
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
    })

    it('pos.allocate: increase liquidity & burn 1000 wei from position', async function () {
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.increasePositionLiquidity(this.contracts.engine, posId, delLiquidity.sub(1000).raw)
    })

    it('emits the Created event', async function () {
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      )
        .to.emit(this.contracts.engine, 'Created')
        .withArgs(this.contracts.engineCreate.address, strike.raw, sigma.raw, maturity.raw)
    })

    it('updates the reserves of the engine with create, but not cumulative reserves', async function () {
      const tx = await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        HashZero
      )
      await tx.wait()
      const timestamp = lastTimestamp.raw

      const reserve = await this.contracts.engine.reserves(poolId)

      expect(reserve.reserveRisky).to.not.equal(0)
      expect(reserve.reserveStable).to.not.equal(0)
      expect(reserve.liquidity).to.equal(parseWei(1).raw)
      expect(reserve.float).to.equal(0)
      expect(reserve.collateralRisky).to.equal(0)
      expect(reserve.collateralStable).to.equal(0)
      expect(reserve.cumulativeLiquidity).to.equal(0)
      expect(reserve.cumulativeRisky).to.equal(0)
      expect(reserve.cumulativeStable).to.equal(0)
      expect(reserve.blockTimestamp).to.equal(timestamp)
    })

    it('initializes the calibration struct', async function () {
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      const calibrations = await this.contracts.engine.calibrations(poolId)
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
        HashZero
      )
      await expect(
        this.contracts.engineCreate.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
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
          HashZero
        )
      ).to.reverted
    })

    it('reverts if maturity is 0', async function () {
      let fig = new Calibration(strike.float, sigma.float, 0, 1, spot.float)
      await expect(
        this.contracts.engine.create(
          fig.strike.raw,
          fig.sigma.raw,
          fig.maturity.raw,
          parseWei(fig.delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.reverted
    })

    it('reverts if pool is expired (maturity is less than current block timestamp)', async function () {
      let fig = new Calibration(strike.float, sigma.float, +(await this.contracts.engine.time()) + 1, 1, spot.float)
      await expect(
        this.contracts.engine.create(
          fig.strike.raw,
          fig.sigma.raw,
          fig.maturity.raw,
          parseWei(fig.delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.reverted
    })

    it('reverts if the actual delta amounts are 0', async function () {
      let fig = new Calibration(100, sigma.float, maturity.seconds, 1, spot.float)
      let pid = computePoolId(this.contracts.engine.address, fig.maturity.raw, fig.sigma.raw, fig.strike.raw)
      await this.contracts.engineCreate.create(
        fig.strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(fig.delta).raw,
        delLiquidity.raw,
        HashZero
      )
      const res = await this.contracts.engine.reserves(pid)
      expect(res.reserveStable.isZero()).to.eq(false)
    })

    it('reverts if strike is greater than uint128', async function () {
      await expect(
        this.contracts.engineCreate.create(
          BigNumber.from(2).pow(128).add(1),
          sigma.raw,
          maturity.raw,
          parseWei(delta).raw,
          delLiquidity.raw,
          HashZero
        )
      ).to.reverted
    })
  })
})
