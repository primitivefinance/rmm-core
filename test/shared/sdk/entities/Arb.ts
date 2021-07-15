import { parseWei, Wei } from 'web3-units'
import { quantilePrime } from '../../CumulativeNormalDistribution'
import { Pool } from './Pool'
import { EPSILON, bisection } from '../utilities'

// This code is contributed by susmitakundugoaldanga.

/**
 * @notice Represents an agent that will look a reference price of the risky asset, denominated in the stable asset,
 * then looks at the reference price in the AMM pool, and will arbitrage any difference.
 */
export class Arbitrageur {
  public readonly optimalAmount: number

  constructor() {
    this.optimalAmount = 1e-8
  }

  arbitrageExactly(spot: Wei, pool: Pool) {
    console.log(`\n   ----- Start Arb at spot price: ${spot.float} -----`)
    const gamma = 1 - pool.entity.fee
    const [R1, R2, invariant, strike, sigma, tau] = [
      pool.reserveRisky.float / pool.liquidity.float,
      pool.reserveStable.float / pool.liquidity.float,
      pool.invariant,
      pool.strike,
      pool.sigma,
      pool.tau,
    ]

    // Marginal price of selling epsilon risky
    const sellPriceRisky = pool.getMarginalPriceSwapRiskyIn(0)

    // Marginal price of buying epsilon risky
    const buyPriceRisky = pool.getMarginalPriceSwapStableIn(0)

    console.log(`\n   Sell price of risky: ${sellPriceRisky}`)
    console.log(`   Buy price risky:     ${buyPriceRisky}`)
    console.log(`   Market price: ${spot.float}`)

    if (sellPriceRisky > spot.float + this.optimalAmount) {
      const func = (amountIn) => {
        return pool.getMarginalPriceSwapRiskyIn(amountIn) - spot.float
      }

      let optimalTrade
      if (Math.sign(func(EPSILON)) != Math.sign(func(1 - R1 - EPSILON))) {
        optimalTrade = bisection(func, EPSILON, 1 - R1 - EPSILON) // bisect
      } else {
        optimalTrade = 1 - R1
      }
      console.log(`\n   Optimal trade is: ${optimalTrade}`)
      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)
      const { deltaOut } = pool.virtualSwapAmountInRisky(optimalTrade)
      const profit = deltaOut.float - optimalTrade.float * spot.float

      console.log(`   Sell profit: ${profit}`)
      if (profit > 0) {
        pool.swapAmountInRisky(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed / Math.pow(10, 18)}`)
      }
    } else if (buyPriceRisky < spot.float - this.optimalAmount) {
      const func = (amountIn) => {
        return spot.float - pool.getMarginalPriceSwapStableIn(amountIn)
      }

      let optimalTrade
      if (Math.sign(func(EPSILON)) != Math.sign(func(strike.float - R2 - EPSILON))) {
        optimalTrade = bisection(func, 0, strike.float - R2 - EPSILON) //bisect func
      } else {
        optimalTrade = strike.float - R2
      }
      console.log(`\n   Optimal trade is: ${optimalTrade}`)
      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)

      const { deltaOut } = pool.virtualSwapAmountInStable(optimalTrade)
      console.log(`   Got delta out of ${deltaOut.float}`)
      const profit = optimalTrade.float * spot.float - deltaOut.float
      console.log(`   Buy profit: ${profit}`)
      if (profit > 0) {
        pool.swapAmountInStable(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed / Math.pow(10, 18)}`)
      }
    }

    console.log(`\n   ----- End Arb -----`)
  }
}
