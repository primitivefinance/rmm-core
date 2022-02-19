import { ethers } from 'hardhat'
import { Wallet } from 'ethers'
import { toBN } from 'web3-units'

import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

TestPools.forEach(function (pool: PoolState) {
  testContext(`margins of ${pool.description} pool`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration

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
      await usePool(this.signers[0], this.contracts, pool.calibration)
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    it('returns 0 for all fields when the margin account is uninitialized', async function () {
      expect(await this.contracts.engine.margins('0x882efb9e67eda9bf74766e8686259cb3a1fc8b8a')).to.deep.equal([
        toBN(0),
        toBN(0),
      ])
    })
  })
})
