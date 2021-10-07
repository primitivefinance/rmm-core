import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { primitiveFixture } from '../../../shared/fixtures'
import { PoolState, TestPools } from '../../../shared/poolConfigs'

TestPools.forEach(function (pool: PoolState) {
  testContext(`constructor of ${pool.description} pool`, function () {
    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
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
