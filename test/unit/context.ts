import { Fixture, loadFixture } from 'ethereum-waffle'
import { Contracts, Mocks } from '../../types'

export default async function setupContext(fixture: Fixture<any>) {
  beforeEach(async function () {
    const loadedFixture = await loadFixture(fixture)

    this.contracts = {} as Contracts
    this.mocks = {} as Mocks

    this.signers = loadedFixture.signers
    this.contracts.factory = loadedFixture.primitiveFactory
    this.mocks.stable = loadedFixture.stable
    this.mocks.risky = loadedFixture.risky
  })
}
