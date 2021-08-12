import { createFixtureLoader, MockProvider } from 'ethereum-waffle'
import { Contracts, ContractName, Configs } from '../../types'
import { Wallet } from 'ethers'
import createTestContracts from './createTestContracts'
import { batchApproval } from '../shared/utils'
import { Calibration } from '../shared'
import { Time, parsePercentage } from 'web3-units'
export const DEFAULT_CONFIG: Calibration = new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(0.0015))

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

      const { risky, stable } = loadedContracts
      const contractAddresses = Object.keys(loadedContracts).map((key) => loadedContracts[key]?.address)
      await batchApproval(contractAddresses, [risky, stable], signers)
      if (action) await action(signers, loadedContracts)

      return { contracts: loadedContracts, configs: loadedConfigs }
    })

    this.contracts = {} as Contracts
    this.signers = provider.getWallets()
    this.deployer = this.signers[0]

    Object.assign(this.contracts, loadedFixture.contracts)
  })
}
