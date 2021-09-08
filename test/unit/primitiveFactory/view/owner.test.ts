import expect from '../../../shared/expect'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'

testContext('owner', async function () {
  beforeEach(async function () {
    const fixture = await this.loadFixture(primitiveFixture)
    this.contracts = fixture.contracts
  })

  it('returns the deployer of the contract as the owner', async function () {
    const [deployer] = this.signers

    expect(await this.contracts.factory.owner()).to.equal(deployer.address)
  })
})
