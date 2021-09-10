import { Wallet } from '@ethersproject/wallet'
import { Calibration, computePoolId, computePositionId } from '.'
import { Contracts } from '../../types'
import { parseWei, toBN, Wei } from 'web3-units'
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
  const { strike, sigma, maturity, delta, precisionStable, precisionRisky } = config
  // since strike is in native precision, scale to 18 decimals if needed
  const scaledStrike = strike.mul(parseWei('1', precisionStable))
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router
      .connect(signer)
      .create(
        scaledStrike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta, 18).raw,
        parseWei('1', precisionStable > precisionRisky ? precisionRisky + 1 : precisionStable + 1).raw,
        HashZero
      )
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call create() on the router in usePool()`, err)
  }

  const poolId = config.poolId(contracts.engine.address)
  console.log(`\n   Using pool with id: ${poolId.slice(0, 6)}`)

  const receipt = await tx.wait()
  const args = receipt?.events?.[0].args
  if (args) {
    const actualPoolId = computePoolId(contracts.engine.address, args.strike, args.sigma, args.maturity)
    if (actualPoolId !== poolId) throw Error(`\n  PoolIds do not match: ${poolId} != ${actualPoolId}`)
  }

  return { tx, poolId }
}

export async function useLiquidity(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  target: string = signer.address
): Promise<UseLiquidity> {
  const poolId = config.poolId(contracts.engine.address)
  const amount = parseWei('1000', 18)
  /// call create on the router contract
  let tx: any
  try {
    tx = await contracts.router.connect(signer).allocateFromExternal(poolId, target, amount.raw, HashZero)
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call allocateFromExternal() on the router`)
  }

  const posId = computePositionId(target, poolId)

  console.log(`\n   Provided ${amount.float} liquidity to ${poolId.slice(0, 6)}`)
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
    console.log(`\n   Error thrown on attempting to call deposit() on the router`)
  }

  console.log(`   Deposited margin acc: ${target.slice(0, 6)},  ${delRisky.float} ${delStable.float}`)
  return { tx }
}

export async function useTokens(
  signer: Wallet,
  contracts: Contracts,
  config: Calibration,
  amount: Wei = parseWei('10000')
): Promise<{ tx: any }> {
  // if config precision is not 18, set the tokens to it
  if (config.precisionRisky != 0) await contracts.risky.setDecimals(config.decimalsRisky)
  if (config.precisionStable != 0) await contracts.stable.setDecimals(config.decimalsStable)
  /// mint tokens for the user
  let tx: any
  try {
    tx = await contracts.risky.connect(signer).mint(signer.address, amount.raw)
    tx = await contracts.stable.connect(signer).mint(signer.address, amount.raw)
  } catch (err) {
    console.log(`\n   Error thrown on attempting to call mint() on the tokens`)
  }

  console.log(`\n   Using tokens with:`)
  console.log(`     - Risky decimals: ${config.decimalsRisky}`)
  console.log(`     - Stable decimals: ${config.decimalsStable}`)
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
