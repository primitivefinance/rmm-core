import hre, { ethers } from 'hardhat'
import { parseWei } from 'web3-units'
import { constants, BigNumber, Wallet } from 'ethers'
import { getStableGivenRisky } from '@primitivefi/rmm-math'

import expect from '../../../shared/expect'
import { parseCalibration } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { useTokens, useApproveAll } from '../../../shared/hooks'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { createFixtureLoader } from 'ethereum-waffle'
import { Interface } from 'ethers/lib/utils'

const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`create ${pool.description} pool`, function () {
    const { strike, sigma, maturity, lastTimestamp, gamma, delta, referencePrice, decimalsRisky, decimalsStable } =
      pool.calibration
    let poolId: string
    const delLiquidity = parseWei('1', 18)
    let chainId: number

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
      chainId = +(await hre.network.provider.send('eth_chainId')).toString()
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(decimalsRisky, decimalsStable)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }

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
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.emit(this.contracts.engine, 'Create')
      })

      it('res.allocate: increases reserve liquidity', async function () {
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
      })

      it('res.allocate: increases reserve risky', async function () {
        const delRisky = parseWei(1 - delta, decimalsRisky)
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
      })

      it('res.allocate: increases reserve stable', async function () {
        const delRisky = parseWei(1 - delta, decimalsRisky)
        const delStable = parseWei(
          getStableGivenRisky(delRisky.float, strike.float, sigma.float, maturity.sub(lastTimestamp).years),
          decimalsStable
        )
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
      })

      it('res.allocate: update block timestamp', async function () {
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
      })

      it('pos.allocate: increase liquidity & burn 1000 wei from position', async function () {
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
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
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.emit(this.contracts.engine, 'Create')
      })

      it('updates the reserves of the engine with create, but not cumulative reserves', async function () {
        const tx = await this.contracts.router.create(
          strike.raw,
          sigma.raw,
          maturity.raw,
          gamma.raw,
          parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
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
        await expect(() =>
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
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
          parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
          delLiquidity.raw,
          HashZero
        )

        // set the contract to expect this error string
        await this.contracts.router.expect('PoolDuplicateError()')
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.be.revertWithCustomError('PoolDuplicateError()', undefined, chainId)
      })

      it('reverts if strike is 0', async function () {
        let fig = parseCalibration(0, sigma.float, maturity.seconds, 0.99, 1, referencePrice.float)
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
        let fig = parseCalibration(strike.float, sigma.float, 0, 0.99, 1, referencePrice.float)
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
        let fig = parseCalibration(
          strike.float,
          sigma.float,
          +(await this.contracts.engine.time()) + 1,
          0.99,
          1,
          referencePrice.float
        )
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
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })

      it('reverts if sigma is 0', async function () {
        const iv = 0
        await expect(
          this.contracts.router.create(
            strike.raw,
            iv,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })

      it('reverts if sigma is gt 1e7', async function () {
        const iv = 1e7 + 1
        await expect(
          this.contracts.router.create(
            strike.raw,
            iv,
            maturity.raw,
            gamma.raw,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })

      it('reverts if gamma is greater than 10000', async function () {
        const tenThousand = 10_000
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            tenThousand + 1,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted

        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            tenThousand + 1,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })

      it('reverts if gamma is less than 9000', async function () {
        const nineThousand = 9000
        await expect(
          this.contracts.router.create(
            strike.raw,
            sigma.raw,
            maturity.raw,
            nineThousand - 1,
            parseWei(1, decimalsRisky).sub(parseWei(delta, decimalsRisky)).raw,
            delLiquidity.raw,
            HashZero
          )
        ).to.reverted
      })
    })
  })
})
