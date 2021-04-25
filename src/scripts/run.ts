import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber } from 'ethers'
import { deploy } from '../utils'
import Model from '../entities/model'

const MODEL = 'Model'
const ORACLE = 'Oracle'
const PURE_ARBER = 'PureArbitrageur'

async function main() {
  // get the default signer
  const signer = hre.ethers.provider.getSigner(0)

  // deploy our oracle feed contract that we will manipulate
  const oracle = await deploy(ORACLE, { from: signer, args: [] })

  // deploy the model contract for our on-chain agents to call
  const model = await deploy(MODEL, { from: signer, args: [oracle.address] })

  // get the args for our arbitrageur: [name, id, model]
  const args = ['Pure', 0, model.address]

  // deploy our pure arbitrageur agent to the hardhat evm
  const agent = await deploy(PURE_ARBER, { from: signer, args: args })

  // init the model, pass in the hardhat run time environment and the agent contract
  const m = new Model(hre, model, agent)

  // start running the model, which will run the ticks of the model in a while loop
  await m.run()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
