import { parseWei } from 'web3-units'
import { constants, BigNumber, Wallet } from 'ethers'
import { getStableGivenRisky } from '@primitivefinance/v2-math'

import expect from '../../../shared/expect'
import { Calibration } from '../../../shared'
import { scaleUp } from '../../../shared/utils'
import { testContext } from '../../../shared/testContext'
import { useTokens, useApproveAll } from '../../../shared/hooks'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { customDecimalsFixture, PrimitiveFixture } from '../../../shared/fixtures'

const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`create ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, gamma, delta, spot, decimalsRisky, decimalsStable } = pool.calibration
    let poolId: string
    const delLiquidity = parseWei('1', 18)

    let fixtureToLoad: ([wallet]: Wallet[], provider: any) => Promise<PrimitiveFixture>
    before(async function () {
      fixtureToLoad = customDecimalsFixture(decimalsRisky, decimalsStable)
    })

    beforeEach(async function () {
      const fixture = await this.loadFixture(fixtureToLoad)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      poolId = pool.calibration.poolId(this.contracts.engine.address)
    })

    describe('success cases', function () {
      it('deploys a new pool', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.emit(this.contracts.engine, 'Create')
      })

      it('res.allocate: increases reserve liquidity', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.allocate: increases reserve risky', async function () {
        const delRisky = scaleUp(1 - delta, decimalsRisky)
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
      })

      it('res.allocate: increases reserve stable', async function () {
        const delRisky = scaleUp(1 - delta, decimalsRisky)
        const delStable = scaleUp(
          getStableGivenRisky(delRisky.float, strike.float, sigma.float, maturity.sub(lastTimestamp).years),
          decimalsStable
        )
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
      })

      it('res.allocate: update block timestamp', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
      })

      it('pos.allocate: increase liquidity & burn 1000 wei from position', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increasePositionLiquidity(
          this.contracts.engine,
          this.contracts.router.address,
          poolId,
          delLiquidity.sub(await this.contracts.engine.MIN_LIQUIDITY()).raw
        )
      })

      it('emits the Create event', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        )
          .to.emit(this.contracts.engine, 'Create')
          .withArgs(this.contracts.router.address, strike.raw, sigma.raw, maturity.raw, gamma.raw)
      })

      it('updates the reserves of the engine with create, but not cumulative reserves', async function () {
        const tx = await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          gamma.raw,
          scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
          delLiquidity.raw,
          HashZero
        )
        await tx.wait()
        const timestamp = lastTimestamp.raw

        const reserve = await this.contracts.engine.reserves(poolId)

        expect(reserve.reserveRisky).to.not.equal(0)
        expect(reserve.reserveStable).to.not.equal(0)
        expect(reserve.liquidity).to.equal(parseWei(1).raw)
        expect(reserve.cumulativeLiquidity).to.equal(0)
        expect(reserve.cumulativeRisky).to.equal(0)
        expect(reserve.cumulativeStable).to.equal(0)
        expect(reserve.blockTimestamp).to.equal(timestamp)
      })

      it('initializes the calibration struct', async function () {
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
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
        await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          gamma.raw,
          scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
          delLiquidity.raw,
          HashZero
        )
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
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
            fig.gamma.raw,
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
            fig.gamma.raw,
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
            fig.gamma.raw,
            parseWei(fig.delta).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })

      it('reverts if strike is greater than uint128', async function () {
        await expect(
          this.contracts.router.create(
            BigNumber.from(2).pow(128).add(1),
            sigma.raw,
            maturity.raw,
            gamma.raw,
            scaleUp(1, decimalsRisky).sub(scaleUp(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })
    })
  })
})
