import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber } from 'ethers'
import Model, { Params } from '../entities/model'
import { createFixtureLoader } from '@ethereum-waffle/provider'
import { simFixture } from '../entities/fixtures'
import { parseWei, PERCENTAGE } from '../../test/shared/Units'

async function main() {
  // get the default signer
  const [signer]: Wallet[] = waffle.provider.getWallets()

  // get the fixture loader fn
  const loadFixture = createFixtureLoader([signer], waffle.provider)

  // get the engine and related contracts
  const fixture = await loadFixture(simFixture)
  const { engine, house, TX1, TY2, oracle, model, agent } = fixture

  // mint tokens to give to arber
  await TX1.mint(model.address, ethers.constants.MaxUint256.sub(1))
  await TY2.mint(model.address, ethers.constants.MaxUint256.sub(1))

  // deposit tokens into the CFMMs internal balance on the arbers behalf
  await agent.deposit(await TX1.balanceOf(signer.address), await TY2.balanceOf(signer.address))

  // init the model, pass in the hardhat run time environment and the agent contract
  const m = new Model(hre, model, agent)
  // init the model's parameters
  const params: Params = { strike: parseWei('25'), sigma: 0.1 * PERCENTAGE, time: 31449600, mu: 0.005, S0: parseWei('25') }
  await m.init(params.strike, params.sigma, params.time, params.mu, params.S0)

  // start running the model, which will run the ticks of the model in a while loop
  await m.run()
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
