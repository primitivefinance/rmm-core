import { ethers, Contract } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import Agent from '../entities/agent'
import { getBlockNumber } from '../utils'
import { parseWei, Wei } from '../../test/shared/Units'
import { GBM } from './timeseries'

function getRandomInt(max) {
  return Math.floor(Math.random() * max)
}

export interface Params {
  strike: Wei
  sigma: number
  time: number
  mu: number
  S0: Wei
}

class Model {
  public readonly schedule: any
  public readonly hre: HardhatRuntimeEnvironment
  public readonly agent: Agent
  public readonly contract: Contract
  public running: boolean
  public params: Params
  public data: Object

  constructor(hre, modelContract, agentContract) {
    this.hre = hre
    this.running = true
    this.params = { strike: new Wei(0), sigma: 0, time: 0, mu: 0, S0: new Wei(0) }
    this.contract = modelContract
    this.agent = new Agent(0, this, agentContract)
    this.data = {}
  }

  async init(strike: Wei, sigma: number, time: number, mu: number, S0: Wei) {
    this.params = {
      strike: strike,
      sigma: sigma,
      time: time,
      mu: mu,
      S0: S0,
    }
    // call the on-chain model to init the params
    await this.contract.init(strike.raw, sigma, time, S0.raw)
  }

  // runs the model
  async run() {
    while (this.running) {
      // executes a tick
      await this.tick()
    }
  }

  async tick() {
    console.log('mine block')
    // mine a block
    await this.hre.ethers.provider.send('evm_mine', [])

    // trigger the model environment
    // S0 = inital price, mu = drift, sigma = vol, T = time horizon, steps = size of time steps, path = true
    const gbm = GBM(this.params.S0.float, this.params.mu, this.params.sigma, this.params.time, 1, true)
    console.log(gbm)
    await this.contract.tick(1)

    // trigger agents
    await this.agent.step()

    // query latest agent data and store it in object
    const data = await this.agent.getLatestData()

    // store the latest agent contract data
    const block = await getBlockNumber(this.hre)
    this.data[block] = data

    // check exit condition
    if (block > 10) this.running = false
  }

  getSpotPriceAfterVirtualSwapAmountInRisky(deltaX) {
    deltaX = parseWei(deltaX).raw
    return 0
  }

  getSpotPriceAfterVirtualSwapAmountInRiskless(deltaX) {
    deltaX = parseWei(deltaX).raw
    return 0
  }
}

export default Model
