import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { Contract, Signer } from 'ethers'
import { ethers } from 'hardhat'

// fetches the provider block number
export const getBlockNumber = async (hre: HardhatRuntimeEnvironment) => {
  return await hre.ethers.provider.getBlockNumber()
}

// easily deploy a contract by passing its name, a from signer, and its args
export const deploy = async (contractName: string, { from, args }: { from?: Signer; args: any }): Promise<Contract> => {
  let factory = await ethers.getContractFactory(contractName)
  if (from) {
    factory.connect(from)
  }
  const contract = await factory.deploy(...args)
  await contract.deployed()
  return contract
}
