import { utils, constants } from 'ethers'
const { keccak256, solidityPack } = utils

export const maxError = {
  cdf: 3.15e-3,
  centralInverseCDF: 1.16e-4,
  tailInverseCDF: 2.458e-5,
}

/**
 * Computes deterministic poolIds from hashing engine address and calibration parameters.
 *
 * @param engine Address of Engine contract.
 * @param strike Strike price in wei, with decimal places equal to the Engine's `stable` token decimals.
 * @param sigma  Implied volatility in basis points.
 * @param maturity Timestamp of expiration in seconds, matching the format of `block.timestamp`.
 * @param gamma  Equal to 10_000 - fee, in basis points. Used to apply fee on swaps.
 *
 * @returns Keccak256 hash of a solidity packed array of engine address and calibration struct.
 *
 * @beta
 */
export function computePoolId(engine: string, strike: string, sigma: string, maturity: string, gamma: string): string {
  return keccak256(
    solidityPack(['address', 'uint128', 'uint32', 'uint32', 'uint32'], [engine, strike, sigma, maturity, gamma])
  )
}

/**
 * Statically computes an Engine address.
 *
 * @remarks
 * Verify `bytecode` is up-to-date.
 *
 * @param factory Deployer of the Engine contract.
 * @param risky Risky token address.
 * @param stable Stable token address.
 * @param bytecode Bytecode of the PrimitiveEngine.sol smart contract.
 *
 * @returns engine address.
 *
 * @beta
 */
export function computeEngineAddress(factory: string, risky: string, stable: string, bytecode: string): string {
  const salt = utils.solidityKeccak256(
    ['bytes'],
    [utils.defaultAbiCoder.encode(['address', 'address'], [risky, stable])]
  )
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
