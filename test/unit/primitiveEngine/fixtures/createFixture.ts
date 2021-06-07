import hre from 'hardhat'
import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { loadFixture } from 'ethereum-waffle'
import { deployMockContract, MockContract } from 'ethereum-waffle'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { TestCalleeCreate, TestCalleeCreate__factory, PrimitiveFactory } from '../../../../typechain'

export type PrimitiveEngineCreateFixture = PrimitiveEngineFixture & { create: TestCalleeCreate }

export async function primitiveEngineCreateFixture(signers: Wallet[]): Promise<PrimitiveEngineCreateFixture> {
  const [deployer] = signers
  const engineFixture = await loadFixture(primitiveEngineFixture)

  const create = await new TestCalleeCreate__factory(deployer).deploy(
    engineFixture.primitiveEngine.address,
    engineFixture.risky.address,
    engineFixture.stable.address
  )

  await engineFixture.stable.approve(create.address, constants.MaxUint256)
  await engineFixture.risky.approve(create.address, constants.MaxUint256)

  return {
    create,
    ...engineFixture,
  }
}

export type PrimitiveFactoryFixture = {
  primitiveFactory: PrimitiveFactory
  signers: Wallet[]
  risky: MockContract
  stable: MockContract
}

export async function primitiveFactoryFixture(signers: Wallet[]): Promise<PrimitiveFactoryFixture> {
  hre.network.provider.send('hardhat_reset')
  const [deployer] = signers

  // const primitiveFactoryFactory = await hre.ethers.getContractFactory('PrimitiveFactory');
  // const primitiveFactory = (await primitiveFactoryFactory.deploy()) as PrimitiveFactory;

  const primitiveFactoryArtifact = await hre.artifacts.readArtifact('PrimitiveFactory')
  const primitiveFactoryNotDeployed = await hre.waffle.deployContract(deployer, primitiveFactoryArtifact)

  const primitiveFactory = ((await primitiveFactoryNotDeployed.deployed()) as unknown) as PrimitiveFactory

  const erc20Artifact = await hre.artifacts.readArtifact('ERC20')

  const risky = await deployMockContract(deployer, erc20Artifact.abi)
  const stable = await deployMockContract(deployer, erc20Artifact.abi)

  return {
    primitiveFactory,
    signers,
    risky,
    stable,
  }
}
