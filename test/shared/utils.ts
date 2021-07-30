import { utils, BigNumber } from 'ethers'

const { keccak256, solidityPack } = utils

export function computePoolId(
  factory: string,
  maturity: string | number,
  sigma: string | BigNumber,
  strike: string | BigNumber
): string {
  return keccak256(solidityPack(['address', 'uint32', 'uint64', 'uint256'], [factory, maturity, sigma, strike]))
}

export function computeEngineAddress(factory: string, risky: string, stable: string, bytecode: string): string {
  const salt = utils.solidityKeccak256(['bytes'], [utils.defaultAbiCoder.encode(['address', 'address'], [risky, stable])])
  return utils.getCreate2Address(factory, salt, utils.keccak256(bytecode))
}
