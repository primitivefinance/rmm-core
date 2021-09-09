import { Wallet } from '@ethersproject/wallet'
import { Calibration, computePositionId } from '.'
import { Contracts } from '../../types'
import { parseWei, Wei } from 'web3-units'
import { ethers } from 'ethers'
const { HashZero, MaxUint256 } = ethers.constants

export interface Tx {
  tx: any
}

export interface UsePool extends Tx {
  poolId: string
}

export interface UseLiquidity extends UsePool {
  posId: string
}

export async function usePool(signer: Wallet, contracts: Contracts, config: Calibration): Promise<UsePool> {
  /// get the parameters from the config
  const { strike, sigma, maturity, lastTimestamp, delta } = config
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router
      .connect(signer)
      .create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  } catch (err) {
    console.log(`\n Error thrown on attempting to call create() on the router in usePool()`, err)
  }

  return { tx, poolId: config.poolId(contracts.engine.address) }
}

export async function useLiquidity(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  target: string = signer.address
): Promise<UseLiquidity> {
  const poolId = config.poolId(contracts.engine.address)
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router.connect(signer).allocateFromExternal(poolId, target, parseWei('1000').raw, HashZero)
  } catch (err) {
    console.log(`\n Error thrown on attempting to call allocateFromExternal() on the router`, err)
  }

  const posId = computePositionId(target, poolId)

  return { tx, poolId, posId }
}

export async function useMargin(
  signer: Wallet,
  contracts: Contracts,
  delRisky: Wei,
  delStable: Wei,
  target: string = signer.address
): Promise<{ tx: any }> {
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router.connect(signer).deposit(target, delRisky.raw, delStable.raw, HashZero)
  } catch (err) {
    console.log(`\n Error thrown on attempting to call deposit() on the router`, err)
  }

  return { tx }
}

export async function useTokens(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  amount: Wei = parseWei('10000')
): Promise<{ tx: any }> {
  // if config precision is not 18, set the tokens to it
  if (config.precisionRisky != 18) await contracts.risky.setDecimals(config.precisionRisky)
  if (config.precisionStable != 18) await contracts.stable.setDecimals(config.precisionStable)
  /// mint tokens for the user
  let tx: any
  try {
    tx = await contracts.risky.connect(signer).mint(signer.address, amount.raw)
    tx = await contracts.stable.connect(signer).mint(signer.address, amount.raw)
  } catch (err) {
    console.log(`\n Error thrown on attempting to call mint() on the tokens`, err)
  }

  return { tx }
}

export async function useApproveAll(signer: Wallet, contracts: Contracts) {
  const targets = Object.keys(contracts).map((key) => contracts[key].address)

  async function approve(target: string) {
    await contracts.risky.connect(signer).approve(target, MaxUint256)
    await contracts.stable.connect(signer).approve(target, MaxUint256)
  }

  for (const target of targets) {
    await approve(target)
  }
}
