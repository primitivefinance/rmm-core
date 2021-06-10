import { createFixtureLoader, Fixture, MockProvider } from 'ethereum-waffle'
import { Contract, Wallet } from 'ethers'
import hre from 'hardhat'
import {
  deployContract,
} from 'ethereum-waffle'

import { Contracts, Mocks } from '../../types'

import * as ContractTypes from '../../typechain'

export async function setupContext(
  provider: MockProvider,
  fixture: Fixture<any>
) {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(fixture);

    this.signers = loadedFixture.signers

    this.contracts = {} as Contracts

    this.contracts.factory = loadedFixture.primitiveFactory
    this.contracts.stable = loadedFixture.stable
    this.contracts.risky = loadedFixture.risky
  })
}

async function deploy(contractName: string, deployer: Wallet): Promise<Contract> {
  const artifact = await hre.artifacts.readArtifact(contractName);
  const contract = await deployContract(deployer, artifact);
  return contract;
}

type ContractName = 'factory' | 'risky' | 'stable' | 'engineCreate'

export async function loadContext(
  provider: MockProvider,
  contracts: ContractName[],
  action: (signers: Wallet[], contracts: Contracts) => void,
): Promise<void> {
  const loadFixture = createFixtureLoader(provider.getWallets(), provider)

  beforeEach(async function () {
    const loadedFixture = await loadFixture(async function (signers: Wallet[]) {
      const [deployer] = signers
      const loadedContracts: Contracts = {} as Contracts

      for (let i = 0; i < contracts.length; i += 1) {
        const contractName = contracts[i]

        switch (contractName) {
          case 'engineCreate':
            loadedContracts.engineCreate = await deploy('TestEngineCreate', deployer) as ContractTypes.TestEngineCreate
            break;
          case 'factory':
            loadedContracts.factory = await deploy('PrimitiveFactory', deployer) as ContractTypes.PrimitiveFactory
            break;
          case 'risky':
            loadedContracts.risky = await deploy('Token', deployer) as ContractTypes.Token
            break;
          case 'stable':
            loadedContracts.stable = await deploy('Token', deployer) as ContractTypes.Token
            break;
          default:
            throw new Error('Unknown contract name');
        }
      }

      await action(signers, loadedContracts);

      return loadedContracts;
    })

    this.contracts = {} as Contracts
    this.mocks = {} as Mocks
    this.signers = provider.getWallets()

    Object.assign(this.contracts, loadedFixture)
  })
}
