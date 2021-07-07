import { createFixtureLoader, MockProvider } from 'ethereum-waffle'
import { Contracts, Functions, Mocks, ContractName } from '../../types'
import { Wallet, constants } from 'ethers'
import createEngineFunctions from './createEngineFunctions'
import createTestContracts from './createTestContracts'
import { parseWei, Percentage, Time, Wei, toBN } from 'web3-units'
interface Config {
  strike: Wei
  sigma: Percentage
  maturity: Time
  lastTimestamp: Time
  spot: Wei
}

export const config: Config = {
  strike: parseWei('2500'),
  sigma: new Percentage(toBN(Percentage.Mantissa * 1)),
  maturity: new Time(Time.YearInSeconds + +Date.now() / 1000),
  lastTimestamp: new Time(+Date.now() / 1000),
  spot: parseWei('2000'),
}

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
      let loadedFunctions: Functions = {} as Functions

      loadedContracts = await createTestContracts(contracts, deployer)
      loadedFunctions = createEngineFunctions(contracts, loadedContracts, deployer)

      if (action) await action(signers, loadedContracts)

      return { contracts: loadedContracts, functions: loadedFunctions }
    })

    this.contracts = {} as Contracts
    this.functions = {} as Functions
    this.mocks = {} as Mocks
    this.signers = provider.getWallets()
    this.deployer = this.signers[0]

    Object.assign(this.contracts, loadedFixture.contracts)
    Object.assign(this.functions, loadedFixture.functions)
  })
}
