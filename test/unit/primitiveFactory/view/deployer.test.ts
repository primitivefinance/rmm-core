import { ethers } from 'hardhat'
import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { engineFixture } from '../../../shared/fixtures'
import { createFixtureLoader } from 'ethereum-waffle'
import { Wallet } from 'ethers'

testContext('deployer', async function () {
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

  it('returns the deployer of the contract as the deployer', async function () {
    const [deployer] = this.signers

    expect(await this.contracts.factory.deployer()).to.equal(deployer.address)
  })
})
