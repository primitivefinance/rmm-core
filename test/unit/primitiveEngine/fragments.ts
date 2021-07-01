import { Wallet, constants } from 'ethers'
import { Contracts } from '../../../types'
import { parseWei, PERCENTAGE } from '../../shared/Units'

const [strike, sigma, time, riskyPrice] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]
const empty = constants.HashZero

export async function createFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
}

export async function depositFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)

  await contracts.stable.approve(contracts.badEngineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.badEngineDeposit.address, constants.MaxUint256)
}

export async function withdrawFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)

  await contracts.engineDeposit.deposit(contracts.engineWithdraw.address, parseWei('1000').raw, parseWei('1000').raw, empty)
}

export async function allocateFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000').raw)

  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('1').raw, empty)
}

export async function removeFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000000').raw)

  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('1').raw, empty)

  const poolId = await contracts.engine.getPoolId(strike, sigma, time)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineRemove.address, parseWei('10').raw, empty)
}

export async function lendFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000000').raw)

  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('1').raw, empty)

  const poolId = await contracts.engine.getPoolId(strike, sigma, time)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineLend.address, parseWei('10').raw, empty)
}

export async function borrowFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('100000000').raw)

  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineBorrow.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineBorrow.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('1').raw, empty)

  const poolId = await contracts.engine.getPoolId(strike, sigma, time)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineLend.address, parseWei('100').raw, empty)
  await contracts.engineLend.lend(poolId, parseWei('100').raw)
}

export async function swapFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.stable.approve(contracts.engineSwap.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineSwap.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.engineDeposit.deposit(contracts.engineAllocate.address, parseWei('1000').raw, parseWei('1000').raw, empty)
  await contracts.engineDeposit.deposit(contracts.engineSwap.address, parseWei('1000').raw, parseWei('1000').raw, empty)
  await contracts.engineDeposit.deposit(signers[0].address, parseWei('10000').raw, parseWei('10000').raw, empty)
  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('0.01').raw, empty)
  const poolId = await contracts.engine.getPoolId(strike, sigma, time)
  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineAllocate.address, parseWei('1000').raw, empty)
}

export async function repayFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('100000000').raw)

  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineRepay.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineRepay.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike, sigma, time, riskyPrice, parseWei('1').raw, empty)

  const poolId = await contracts.engine.getPoolId(strike, sigma, time)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineLend.address, parseWei('100').raw, empty)
  await contracts.engineLend.lend(poolId, parseWei('100').raw)
}
