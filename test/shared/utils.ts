import { utils, BigNumber, constants } from 'ethers'
const { keccak256, solidityPack } = utils

export function computePoolId(
  engine: string,
  maturity: string | number,
  sigma: string | BigNumber,
  strike: string | BigNumber
): string {
  return keccak256(solidityPack(['address', 'uint256', 'uint64', 'uint32'], [engine, strike, sigma, maturity]))
}

export function computeEngineAddress(factory: string, risky: string, stable: string, bytecode: string): string {
  const salt = utils.solidityKeccak256(['bytes'], [utils.defaultAbiCoder.encode(['address', 'address'], [risky, stable])])
  return utils.getCreate2Address(factory, salt, utils.keccak256(bytecode))
}

/**
 *
 * @param arrayOfAddresses Spenders to approve
 * @param arrayOfTokens Tokens to do approvals on
 * @param arrayOfSigners Account owners to be approved
 */
export async function batchApproval(arrayOfAddresses, arrayOfTokens, arrayOfSigners) {
  // for each contract
  for (let c = 0; c < arrayOfAddresses.length; c++) {
    let address = arrayOfAddresses[c]
    // for each token
    for (let t = 0; t < arrayOfTokens.length; t++) {
      let token = arrayOfTokens[t]
      // for each owner
      for (let u = 0; u < arrayOfSigners.length; u++) {
        let signer = arrayOfSigners[u]
        await token.connect(signer).approve(address, constants.MaxUint256)
      }
    }
  }
}
