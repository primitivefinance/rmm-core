import { ethers } from 'hardhat'
import { Fixture } from 'ethereum-waffle'
import { Libraries } from '../../types'
import * as ContractTypes from '../../typechain'
import { TestGetStableGivenRisky, TestCalcInvariant } from '../../typechain'
import MockEngineArtifact from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

interface FactoryFixture {
  factory: ContractTypes.MockFactory
}

async function factoryFixture(): Promise<FactoryFixture> {
  const factoryFactory = await ethers.getContractFactory('MockFactory')
  const factory = (await factoryFactory.deploy()) as ContractTypes.MockFactory
  return { factory }
}

interface TokensFixture {
  risky: ContractTypes.TestToken
  stable: ContractTypes.TestToken
}

async function tokensFixture(decimalsRisky: number, decimalsStable: number): Promise<TokensFixture> {
  const tokenFactory = await ethers.getContractFactory('TestToken')
  const risky = (await tokenFactory.deploy('Test Risky 0', 'RISKY0', decimalsRisky)) as ContractTypes.TestToken
  const stable = (await tokenFactory.deploy('Test Stable 1', 'STABLE1', decimalsStable)) as ContractTypes.TestToken

  return { risky, stable }
}

export interface EngineFixture {
  factory: ContractTypes.MockFactory
  factoryDeploy: ContractTypes.FactoryDeploy
  router: ContractTypes.TestRouter
  createEngine(
    decimalsRisky: number,
    decimalsStable: number
  ): Promise<{ engine: ContractTypes.MockEngine; risky: ContractTypes.TestToken; stable: ContractTypes.TestToken }>
}

export const engineFixture: Fixture<EngineFixture> = async function (): Promise<EngineFixture> {
  const { factory } = await factoryFixture()

  const factoryDeployFactory = await ethers.getContractFactory('FactoryDeploy')

  const factoryDeploy = (await factoryDeployFactory.deploy()) as ContractTypes.FactoryDeploy
  const tx = await factoryDeploy.initialize(factory.address)
  await tx.wait()

  const routerContractFactory = await ethers.getContractFactory('TestRouter')

  // The engine MUST be set in the router, once one has been deployed
  const router = (await routerContractFactory.deploy(ethers.constants.AddressZero)) as ContractTypes.TestRouter

  return {
    factory,
    factoryDeploy,
    router,
    createEngine: async (decimalsRisky: number, decimalsStable: number) => {
      const { risky, stable } = await tokensFixture(decimalsRisky, decimalsStable)
      const tx = await factory.deploy(risky.address, stable.address)
      await tx.wait()
      const addr = await factory.getEngine(risky.address, stable.address)
      const engine = (await ethers.getContractAt(MockEngineArtifact.abi, addr)) as unknown as ContractTypes.MockEngine
      await router.setEngine(engine.address)
      return { engine, risky, stable }
    },
  }
}

export interface LibraryFixture {
  libraries: Libraries
}

export const librariesFixture: Fixture<LibraryFixture> = async function (): Promise<LibraryFixture> {
  const libraries: Libraries = {} as Libraries

  const reserveFactory = await ethers.getContractFactory('TestReserve')
  const marginFactory = await ethers.getContractFactory('TestMargin')
  const replicationFactory = await ethers.getContractFactory('TestReplicationMath')
  const cdfFactory = await ethers.getContractFactory('TestCumulativeNormalDistribution')

  libraries.testReserve = (await reserveFactory.deploy()) as ContractTypes.TestReserve

  libraries.testMargin = (await marginFactory.deploy()) as ContractTypes.TestMargin

  libraries.testReplicationMath = (await replicationFactory.deploy()) as ContractTypes.TestReplicationMath

  libraries.testCumulativeNormalDistribution =
    (await cdfFactory.deploy()) as ContractTypes.TestCumulativeNormalDistribution

  return { libraries }
}

export interface TestStepFixture extends LibraryFixture {
  getStableGivenRisky: TestGetStableGivenRisky
  calcInvariant: TestCalcInvariant
}

export const replicationLibrariesFixture: Fixture<TestStepFixture> = async function (
  [wallet],
  provider
): Promise<TestStepFixture> {
  const libraries = await librariesFixture([wallet], provider)

  const stableRiskyFactory = await ethers.getContractFactory('TestGetStableGivenRisky')
  const getStableGivenRisky = (await stableRiskyFactory.deploy()) as TestGetStableGivenRisky
  await getStableGivenRisky.deployed()

  const invariantFactory = await ethers.getContractFactory('TestCalcInvariant')
  const calcInvariant = (await invariantFactory.deploy()) as TestCalcInvariant
  await calcInvariant.deployed()
  return {
    getStableGivenRisky,
    calcInvariant,
    ...libraries,
  }
}
