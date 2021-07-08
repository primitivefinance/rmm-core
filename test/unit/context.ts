import { createFixtureLoader, MockProvider } from 'ethereum-waffle'
import { Contracts, Functions, Mocks, ContractName, Config } from '../../types'
import { Wallet } from 'ethers'
import createEngineFunctions from './createEngineFunctions'
import createTestContracts from './createTestContracts'
import { parseWei, Percentage, Time, toBN } from 'web3-units'

export const config: Config = {
  strike: parseWei('25'),
  sigma: new Percentage(toBN(Percentage.Mantissa * 1)),
  maturity: new Time(Time.YearInSeconds),
  lastTimestamp: new Time(0),
  spot: parseWei('10'),
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
    this.config = config // enables us to have dynamic config fixtures

    Object.assign(this.contracts, loadedFixture.contracts)
    Object.assign(this.functions, loadedFixture.functions)
  })
}
