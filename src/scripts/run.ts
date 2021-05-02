import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract, BigNumber } from 'ethers'
import Model, { Params } from '../entities/model'
import { getOutputAmount, getPoolParams } from '../../test/shared/Engine'
import { createFixtureLoader } from '@ethereum-waffle/provider'
import { simFixture } from '../entities/fixtures'
import { parseWei, PERCENTAGE } from '../../test/shared/Units'
import fs from 'fs'

const writeSimData = (simData, path) => {
  let data = JSON.stringify(simData, null, 2)
  fs.writeFileSync(path, data)
}

async function main() {
  // get the default signer
  const [signer]: Wallet[] = waffle.provider.getWallets()

  // get the fixture loader fn
  const loadFixture = createFixtureLoader([signer], waffle.provider)

  // get the engine and related contracts
  const fixture = await loadFixture(simFixture)
  const { engine, house, TX1, TY2, oracle, model, agent } = fixture

  // mint tokens to give to arber
  await TX1.mint(model.address, parseWei('1000000000').raw)
  await TY2.mint(model.address, parseWei('1000000000').raw)

  // deposit tokens into the CFMMs internal balance on the arbers behalf
  await agent.deposit(await TX1.balanceOf(model.address), await TY2.balanceOf(model.address))

  // init the model, pass in the hardhat run time environment and the agent contract
  const m = new Model(hre, model, agent, engine)
  // init the model's parameters
  const params: Params = {
    strike: parseWei('1000'),
    sigma: 0.2 * PERCENTAGE,
    time: 31449600,
    mu: 0.005,
    S0: parseWei('1000'),
  }
  await m.init(params.strike, params.sigma, params.time, params.mu, params.S0)

  // mint tokens for the initial engine reserves
  const pid = await model.pid()
  const res = await engine.getReserve(pid)
  await TX1.mint(engine.address, res.RX1.toString())
  await TY2.mint(engine.address, res.RY2.toString())
  // start running the model, which will run the ticks of the model in a while loop
  await m.run()
  console.log(m.data)

  // write the data
  const path = `./src/data/simulation.json`
  writeSimData(m.data, path)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
