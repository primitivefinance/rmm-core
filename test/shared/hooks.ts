import { Wallet } from '@ethersproject/wallet'
import { Calibration } from '.'
import { Contracts } from '../../types'
import { parseWei } from 'web3-units'
import { ethers } from 'ethers'
const { HashZero } = ethers.constants

export async function createPoolWithConfig(signer: Wallet, contracts: Contracts, config: Calibration) {
  /// get the parameters from the config
  const { strike, sigma, maturity, lastTimestamp, delta } = config
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  } catch (err) {
    console.log(`\n Error thrown on attempting to call create() on the router in createPoolWithConfig()`)
  }

  return tx
}
