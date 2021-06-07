import { createFixtureLoader, Fixture, MockProvider } from 'ethereum-waffle'
import { Contracts, Mocks } from '../../types'

export default async function setupContext(
  provider: MockProvider,
  fixture: Fixture<any>
) {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(fixture);

    this.contracts = {} as Contracts
    this.mocks = {} as Mocks

    this.signers = loadedFixture.signers
    this.contracts.factory = loadedFixture.primitiveFactory
    this.mocks.stable = loadedFixture.stable
    this.mocks.risky = loadedFixture.risky
  })
}
