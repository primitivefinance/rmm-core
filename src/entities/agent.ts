import { BigNumberish, Contract } from 'ethers'
import Model from './model'

// the smart contract data structure to track the change in state
interface Data {
  number: BigNumberish
  feed: BigNumberish
  BX1: BigNumberish
  BY2: BigNumberish
  stepped: boolean
}

class Agent {
  // an id number for the typescript model
  public readonly id: number
  // the typescript model entity
  public readonly model: Model
  // the agent smart contract
  public readonly contract: Contract

  constructor(aid: number, model: Model, contract: Contract) {
    this.id = aid
    this.model = model
    this.contract = contract
  }

  // runs the smart contract step call
  async step() {
    await this.contract.step()
  }

  // fetches the latest data from the smart contract
  async getLatestData(): Promise<Data> {
    const data = await this.contract.getLatestData()
    const obj: Data = {
      number: data.number.toString(),
      feed: data.feed.toString(),
      BX1: data.BX1.toString(),
      BY2: data.BY2.toString(),
      stepped: data.stepped.toString(),
    }
    return obj
  }

  advance() {}
}

export default Agent
