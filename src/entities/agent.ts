import { BigNumberish, Contract } from 'ethers'
import { formatEther, parseWei } from '../../test/shared/Units'
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
    const spot = await this.model.spotPrice()
    const reference = await this.model.contract.getFeed()

    if (spot.gt(reference)) {
      let postSpot = spot
      let amountIn = 0.001
      while (postSpot.gt(reference)) {
        postSpot = await this.model.getSpotPriceAfterVirtualSwapAmountInRisky(amountIn)
        if (false)
          console.log(`
        Swap IN risky
        post spot price: ${postSpot.float}, 
        reference price: ${formatEther(reference)}
        `)
        amountIn += 0.001
      }

      // execute a swap
      await this.contract.swapAmountInRisky(parseWei(amountIn).raw)
    } else {
      let postSpot = spot
      let amountIn = 0.001
      while (postSpot.lt(reference)) {
        postSpot = await this.model.getSpotPriceAfterVirtualSwapAmountOutRisky(amountIn)
        if (false)
          console.log(`
        Swap OUT risky
        post spot price: ${postSpot.float}, 
        reference price: ${formatEther(reference)}
        `)
        amountIn += 0.001
      }

      // execute a swap
      await this.contract.swapAmountOutRisky(parseWei(amountIn).raw)
    }

    // log the data
    //const block = await this.model.hre.ethers.provider.getBlockNumber()
    //await this.contract.storeData(block)
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
}

export default Agent
