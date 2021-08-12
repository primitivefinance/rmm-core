import { createFixtureLoader, MockProvider } from 'ethereum-waffle'
import { Contracts, ContractName, Configs } from '../../types'
import { Wallet } from 'ethers'
import createTestContracts from './createTestContracts'
import createTestConfigs, { DEFAULT_CONFIG } from './createTestConfigs'
import { batchApproval } from '../shared/utils'
export { DEFAULT_CONFIG }
const strikesToTest = [10, 15, 25, 100]
const sigmasToTest = [0.1, 0.25, 0.5, 0.75, 1, 2]
const maturitiesToTest = [0.01, 0.1, 1, 10]
const spotsToTest = [5, 10, 15, 30, 60, 120]

export default function loadContext(
  provider: MockProvider,
  contracts: ContractName[],
  action?: (signers: Wallet[], contracts: Contracts) => Promise<void>
): void {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(async function (signers: Wallet[]) {
      const [deployer] = signers
      let loadedContracts: Contracts = {} as Contracts
      let loadedConfigs: Configs = {} as Configs

      loadedContracts = await createTestContracts(contracts, deployer)
      loadedConfigs = createTestConfigs(strikesToTest, sigmasToTest, maturitiesToTest, spotsToTest)

      const { risky, stable } = loadedContracts
      const contractAddresses = Object.keys(loadedContracts).map((key) => loadedContracts[key]?.address)
      await batchApproval(contractAddresses, [risky, stable], signers)
      if (action) await action(signers, loadedContracts)

      return { contracts: loadedContracts, configs: loadedConfigs }
    })

    this.configs = {} as Configs
    this.contracts = {} as Contracts
    this.signers = provider.getWallets()
    this.deployer = this.signers[0]

    Object.assign(this.configs, loadedFixture.configs) // enables us to have dynamic config fixtures
    Object.assign(this.contracts, loadedFixture.contracts)
  })
}
