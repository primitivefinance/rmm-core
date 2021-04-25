import { ethers, Contract } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import Agent from '../entities/agent'
import { getBlockNumber } from '../utils'
import { Wei } from '../../test/shared/Units'

function getRandomInt(max) {
  return Math.floor(Math.random() * max)
}

class Model {
  public readonly schedule: any
  public readonly hre: HardhatRuntimeEnvironment
  public readonly agent: Agent
  public readonly contract: Contract
  public running: boolean
  public currId: number
  public data: Object

  constructor(hre, modelContract, agentContract) {
    this.running = true
    this.currId = 0
    this.data = {}
    this.hre = hre
    this.contract = modelContract
    this.agent = new Agent(0, this, agentContract)
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
    const rng = getRandomInt(10)
    await this.contract.tick(rng)

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

  get nextId(): number {
    return this.currId++
  }
}

export default Model
