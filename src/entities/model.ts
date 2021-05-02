import { ethers, Contract } from 'ethers'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import Agent from '../entities/agent'
import { getBlockNumber } from '../utils'
import { parseWei, PERCENTAGE, Wei, YEAR } from '../../test/shared/Units'
import { GBM } from './timeseries'
import { getCalibration, Calibration, getReserve, Reserve, calculateInvariant, PoolParams } from '../../test/shared/Engine'
import { getTradingFunction } from '../../test/shared/ReplicationMath'

import numeric from 'numeric'

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
  public readonly engine: Contract
  public running: boolean
  public params: Params
  public data: Object
  public gbm: []
  public startBlock: number
  public ticks: number
  public currTick: number

  constructor(hre, modelContract, agentContract, engineContract) {
    this.hre = hre
    this.running = true
    this.params = { strike: new Wei(0), sigma: 0, time: 0, mu: 0, S0: new Wei(0) }
    this.contract = modelContract
    this.engine = engineContract
    this.agent = new Agent(0, this, agentContract)
    this.data = {}
    this.gbm = []
    this.startBlock = 0
    this.ticks = 365
    this.currTick = 0
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

    // initialize the GBM
    const block = await getBlockNumber(this.hre)
    this.startBlock = block
    // generate the gbm
    this.gbm = GBM(
      this.params.S0.float, // stock price at time = 0
      this.params.mu, // drift
      this.params.sigma / PERCENTAGE, // vol? figure out what vol
      this.params.time / YEAR, // time in years
      this.ticks, // amount of blocks or steps to take
      true
    )
  }

  // fetchs the gbm price at a block, assuming the model started at `startBlock`.
  getGBM(): number {
    return this.gbm[this.currTick - 1]
  }

  // runs the model
  async run() {
    while (this.running) {
      // executes a tick
      await this.tick()
    }
    console.log(this.data)
  }

  async tick() {
    // mine a block
    await this.mine()

    console.log(this.currTick)

    // fetch the gbm price at this block
    // S0 = inital price, mu = drift, sigma = vol, T = time horizon, steps = size of time steps, path = true
    const gbm = this.getGBM()

    // Tick the on-chain model by setting the new reference price
    await this.contract.tick(parseWei(gbm.toString()).raw)

    // trigger agents -> abritrageur will do swaps
    await this.agent.step()

    // store the model on-chain data
    await this.storeData()

    // check exit condition
    this.exitCondition()
  }

  async mine() {
    this.currTick++
    await this.hre.ethers.provider.send('evm_mine', [])
  }

  async storeData() {
    const reference = new Wei(await this.contract.getFeed())
    const spot = await this.spotPrice()
    // store the latest agent contract data
    this.data[this.currTick - 1] = {
      reference: reference.float,
      spot: spot.float,
      percent: (spot.float / reference.float - 1) * 100,
    }
  }

  exitCondition() {
    if (this.currTick > this.ticks) this.running = false
  }

  getSpotPrice(x: Wei[], cal: Calibration): Wei {
    const fn = function (x: number[]) {
      const params: PoolParams = {
        reserve: {
          RX1: parseWei(x[0]),
          RY2: parseWei(x[1] ? x[1] : 0),
          liquidity: parseWei('1'),
          float: parseWei('0'),
        },
        calibration: cal,
      }
      return calculateInvariant(params)
    }
    const spot = numeric.gradient(
      fn,
      x.map((z) => z.float)
    )
    //console.log({ spot }, [x[0].float, x[1].float], spot[0] / spot[1])
    return parseWei(spot[0] / spot[1])
  }

  async spotPrice() {
    const cal: Calibration = {
      strike: this.params.strike.raw,
      sigma: this.params.sigma,
      time: this.params.time,
    }

    const res: Reserve = await getReserve(this.engine, await this.contract.pid())
    const x: Wei[] = [res.RX1, res.RY2]
    return this.getSpotPrice(x, cal)
  }

  async getSpotPriceAfterVirtualSwapAmountInRisky(deltaX): Promise<Wei> {
    const pid = await this.contract.pid()
    const res: Reserve = await getReserve(this.engine, pid)
    const cal: Calibration = await getCalibration(this.engine, pid)
    const RX1: Wei = parseWei(deltaX).add(res.RX1)
    const RY2: Wei = parseWei(getTradingFunction(RX1, res.liquidity, cal))
    // assume RY2 has decreased since we added risky and removed riskfree
    const deltaY: Wei = res.RY2.sub(RY2)
    const spot: Wei = this.getSpotPrice([RX1, RY2], cal)
    return spot
  }

  async getSpotPriceAfterVirtualSwapAmountOutRisky(deltaX): Promise<Wei> {
    const pid = await this.contract.pid()
    const res: Reserve = await getReserve(this.engine, pid)
    const cal: Calibration = await getCalibration(this.engine, pid)
    const RX1: Wei = res.RX1.sub(parseWei(deltaX))
    const RY2: Wei = parseWei(getTradingFunction(RX1, res.liquidity, cal))
    // assume RY2 has increased since we removed risky and added riskfree
    const deltaY: Wei = RY2.sub(res.RY2)
    const spot: Wei = this.getSpotPrice([RX1, RY2], cal)
    return spot
  }
}

export default Model
