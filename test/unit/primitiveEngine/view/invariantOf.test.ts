import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parsePercentage, parseWei } from 'web3-units'

import expect from '../../../shared/expect'
import { parseCalibration } from '../../../shared'
import { testContext } from '../../../shared/testContext'
import { computePoolId } from '../../../shared/utils'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

TestPools.forEach(function (pool: PoolState) {
  testContext(`invariant of ${pool.description} pool`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration
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

    it('does not revert if expired', async function () {
      const cal = parseCalibration(10, 1, 1, 1 - 0.0015, 0, 10, decimalsRisky, decimalsStable)
      const account = this.signers[0].address
      await this.contracts.risky.mint(account, parseWei('1000').raw)
      await this.contracts.stable.mint(account, parseWei('1000').raw)
      await this.contracts.router.create(
        cal.strike.raw,
        cal.sigma.raw,
        cal.maturity.raw,
        cal.gamma.raw,
        parseWei(1, cal.decimalsRisky).sub(parseWei(cal.delta, cal.decimalsRisky)).raw,
        parseWei('1').raw,
        constants.HashZero
      )
      await this.contracts.engine.advanceTime(10)
      poolId = computePoolId(
        this.contracts.engine.address,
        cal.strike.toString(),
        cal.sigma.toString(),
        cal.maturity.toString(),
        cal.gamma.toString()
      )
      await this.contracts.router.swap(
        this.contracts.router.address,
        poolId,
        true,
        2000,
        1,
        false,
        true,
        constants.HashZero
      )
      await expect(this.contracts.engine.invariantOf(poolId)).to.not.be.reverted
    })
  })
})
