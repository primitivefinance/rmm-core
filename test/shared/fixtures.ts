import { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber } from 'ethers'
import { deployContract, link } from 'ethereum-waffle'
import Engine from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'

const overrides = { gasLimit: 9500000 }

export interface EngineFixture {
  engine: Contract
}

export async function engineFixture([wallet]: Wallet[], provider: any): Promise<EngineFixture> {
  const engine = await deployContract(wallet, Engine, [], overrides)
  return { engine }
}
