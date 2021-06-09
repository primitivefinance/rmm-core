import { createFixtureLoader, Fixture, MockProvider } from 'ethereum-waffle'
import { Contracts, Mocks } from '../../types'

export default async function setupContext(provider: MockProvider, fixture: Fixture<any>) {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(fixture)

    this.contracts = {} as Contracts
    this.mocks = {} as Mocks

    this.signers = loadedFixture.signers

    // we have context this.contracts, and we have another object, and we want to assign all the items
    // of our fixture object to our contracts
    Object.keys(loadedFixture).map((contract) => (this.contracts[contract] = loadedFixture[contract]))
  })
}
