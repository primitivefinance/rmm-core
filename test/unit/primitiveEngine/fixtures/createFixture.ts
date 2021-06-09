import hre, { ethers } from 'hardhat'
import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'
import { Wallet, constants } from 'ethers'
import { deployContract, loadFixture } from 'ethereum-waffle'
import { EngineCreate } from '../../../../typechain'

interface Contracts {
  create: EngineCreate
}

interface Functions {}

export type PrimitiveEngineCreateFixture = PrimitiveEngineFixture & { contracts: Contracts; functions: Functions }

export async function primitiveEngineCreateFixture(signers: Wallet[]): Promise<PrimitiveEngineCreateFixture> {
  const context = await primitiveEngineFixture(signers)

  /*
  const [deployer] = signers
  const createArtifact = await hre.artifacts.readArtifact('EngineCreate')
   const create = (await deployContract(deployer, createArtifact, [
    context.primitiveEngine.address,
    context.risky.address,
    context.stable.address,
  ])) as EngineCreate */

  const create = ((await (await ethers.getContractFactory('EngineCreate')).deploy(
    context.contracts.primitiveEngine.address,
    context.contracts.risky.address,
    context.contracts.stable.address
  )) as unknown) as EngineCreate

  await context.contracts.stable.approve(create.address, constants.MaxUint256)
  await context.contracts.risky.approve(create.address, constants.MaxUint256)

  return {
    ...context,
    contracts: {
      ...context.contracts,
      create: create,
    },
    functions: {
      ...context.functions,
    },
  }
}
