import { Wallet } from 'ethers'
import { toBN } from 'web3-units'

import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { customDecimalsFixture, PrimitiveFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../../shared/hooks'

TestPools.forEach(function (pool: PoolState) {
  testContext(`calibrations of ${pool.description} pool`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration

    let fixtureToLoad: ([wallet]: Wallet[], provider: any) => Promise<PrimitiveFixture>
    before(async function () {
      fixtureToLoad = customDecimalsFixture(decimalsRisky, decimalsStable)
    })

    beforeEach(async function () {
      const fixture = await this.loadFixture(fixtureToLoad)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      await usePool(this.signers[0], this.contracts, pool.calibration)
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    it('returns 0 for all fields when the pool is uninitialized', async function () {
      const foo = await this.contracts.engine.calibrations(
        '0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5'
      )
      expect(foo).to.deep.equal([toBN('0'), 0, 0, 0, 0])
    })
  })
})
