import { ethers } from 'hardhat'
import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { engineFixture } from '../../../shared/fixtures'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { createFixtureLoader } from 'ethereum-waffle'
import { Wallet } from 'ethers'

TestPools.forEach(function (pool: PoolState) {
  testContext(`constructor of ${pool.description} pool`, function () {
    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(18, 18)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }
    })

    describe('when the contract is deployed', function () {
      it('has the risky', async function () {
        expect(await this.contracts.engine.risky()).to.equal(this.contracts.risky.address)
      })

      it('has the stable', async function () {
        expect(await this.contracts.engine.stable()).to.equal(this.contracts.stable.address)
      })

      it('has the factory', async function () {
        expect(await this.contracts.engine.factory()).to.equal(this.contracts.factory.address)
      })
    })
  })
})
