import {
  Wallet,
  constants,
} from 'ethers'
import hre from 'hardhat'

import * as ContractTypes from '../../../typechain'
import { Contracts } from '../../../types'

export async function createFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.factory.create(contracts.risky.address, contracts.stable.address)
  const engineAdd = await contracts.factory.getEngine(contracts.risky.address, contracts.stable.address)

  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)

  contracts.engine = await hre.ethers.getContractAt('PrimitiveEngine', engineAdd) as ContractTypes.PrimitiveEngine
}
