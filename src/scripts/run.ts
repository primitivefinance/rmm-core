import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber } from 'ethers'
import Model from '../entities/model'
import { createFixtureLoader } from '@ethereum-waffle/provider'
import { simFixture } from '../entities/fixtures'

async function main() {
  // get the default signer
  const [signer]: Wallet[] = waffle.provider.getWallets()

  // get the fixture loader fn
  const loadFixture = createFixtureLoader([signer], waffle.provider)

  // get the engine and related contracts
  const fixture = await loadFixture(simFixture)
  const { engine, house, TX1, TY2, oracle, model, agent } = fixture

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
