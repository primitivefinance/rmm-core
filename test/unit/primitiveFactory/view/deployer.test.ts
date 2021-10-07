import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { primitiveFixture } from '../../../shared/fixtures'

testContext('deployer', async function () {
  beforeEach(async function () {
    const fixture = await this.loadFixture(primitiveFixture)
    this.contracts = fixture.contracts
  })

  it('returns the deployer of the contract as the deployer', async function () {
    const [deployer] = this.signers

    expect(await this.contracts.factory.deployer()).to.equal(deployer.address)
  })
})
