import { ethers, waffle } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import { deployContract } from 'ethereum-waffle'
import Oracle from '../../artifacts/contracts/evm-sim/Oracle.sol/Oracle.json'
import Model from '../../artifacts/contracts/evm-sim/Model.sol/Model.json'
import PureArbitrageur from '../../artifacts/contracts/evm-sim/PureArbitrageur.sol/PureArbitrageur.json'
import { engineFixture, EngineFixture } from '../../test/shared/fixtures'

const overrides = { gasLimit: 9500000 }

export interface SimFixture extends EngineFixture {
  oracle: Contract // simulation oracle external reference feeds
  model: Contract // simulation controller contract
  agent: Contract // pure arbitrageur agent to arb the cfmm
}

export async function simFixture([wallet]: Wallet[], provider): Promise<SimFixture> {
  const fixture = await engineFixture([wallet], provider)
  const { engine, house, TX1, TY2 } = fixture
  // deploy our oracle feed contract that we will manipulate
  const oracle = await deployContract(wallet, Oracle, [], overrides)
  // deploy the model contract for our on-chain agents to call
  const model = await deployContract(wallet, Model, [oracle.address, engine.address], overrides)
  // get the args for our arbitrageur: [name, id, model]
  const args = ['Pure', 0, model.address]
  // deploy our pure arbitrageur agent to the hardhat evm
  const agent = await deployContract(wallet, PureArbitrageur, args, overrides)
  return { engine, house, TX1, TY2, oracle, model, agent }
}
