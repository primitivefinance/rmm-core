import { parseWei, Wei } from 'web3-units'
import { Pool } from './Pool'
import { EPSILON, bisection } from '../utilities'

/**
 * Arbitrageur Guide!
 *
 * The goal of this arbitrageur is to swap in the pool some value, and receive more value in return.
 * This is a condition which can (and should) occur, when external variables change.
 *
 * There are two common scenarios that can cause this profitable opportunity to occur:
 * 1. A change in the reference price of the risky asset, all else remains equal
 * 2. A change in the time until expiry of the pool, all else remains equal
 *
 * The desired behavior of the AMM pool is that the marginal price of the risky asset
 * is equal to the reference price of the risky asset (e.g. marginal price on Uniswap)
 *
 * One of the differences between this AMM and other AMMs is that time affects the marginal price!
 * This means, if only time moves forward, profitable arbitrage opportunities will be created.
 * (When marginal price of buying risky < reference price, or marginal price of selling risky > reference price)
 *
 * Knowing these opportunities can arrive, this arbitrageur class has a script ready to capture it.
 *
 * Step 1. Get Marginal price of selling risky
 *
 * Step 2. Get Marginal price of buying risky
 *
 * Step 3. Do a swap in the direction such that we make the most profit -> continue in Step 4.
 *
 * Step 4. Get a function that returns the potential profit amount by comparing the pool spot with the reference spot
 *
 * Step 5. Get the optimal amount. Find the root of this function, such that the (pool spot - reference spot) = 0
 *
 * Step 6. Do a virtual swap (stateless) of this optimal amount to get the actual amount out
 *
 * Step 7. Calculate the profit of the swap, check if value of tokens out > value of tokens in
 *
 * Step 8. Check the profit condition, (i.e. have we profited more than 0 from this swap?)
 *
 * Step 9. If profit condition passes, execute the swap
 */

/**
 * @notice Represents an agent that will look a reference price of the risky asset, denominated in the stable asset,
 * then looks at the reference price in the AMM pool, and will arbitrage any difference.
 */
export class Arbitrageur {
  public readonly optimalAmount: number

  constructor() {
    this.optimalAmount = 1e-8
  }

  /**
   * @notice  Performs a swap such that after the swap the spot reference price and pool spot price price match
   * @dev     Updates state of `pool`
   * @param spot Price of risky asset
   * @param pool Instance of a virtual Pool class
   */
  arbitrageExactly(spot: Wei, pool: Pool) {
    console.log(`\n   ----- Start Arb at spot price: ${spot.float} -----`)
    const [R1, R2, invariant, strike, sigma, tau] = [
      pool.reserveRisky.float / pool.liquidity.float,
      pool.reserveStable.float / pool.liquidity.float,
      pool.invariant,
      pool.strike,
      pool.sigma,
      pool.tau,
    ]

    // Step 1. Get Marginal price of selling epsilon risky
    const sellPriceRisky = pool.getMarginalPriceSwapRiskyIn(0)

    // Step 2. Get Marginal price of buying epsilon risky
    const buyPriceRisky = pool.getMarginalPriceSwapStableIn(0)

    console.log(`\n   Sell price of risky: ${sellPriceRisky}`)
    console.log(`   Buy price risky:     ${buyPriceRisky}`)
    console.log(`   Market price: ${spot.float}`)

    // Step 3. Perform a swap to move marginal price closer to the spot price
    if (sellPriceRisky > spot.float + this.optimalAmount) {
      // Step 4a. Get a function to check if we are close to reference spot price
      /**
       * @returns Difference of pool spot price and reference spot price
       */
      const func = (amountIn) => {
        return pool.getMarginalPriceSwapRiskyIn(amountIn) - spot.float
      }

      // Step 5a. Get the optimal amount to trade in such that pool spot === reference spot
      let optimalTrade
      if (Math.sign(func(EPSILON)) != Math.sign(func(1 - R1 - EPSILON))) {
        // Runs a bisection algorithim to find the root of the function, such that it returns 0
        // We want this result because (pool spot price - reference spot) = 0 means the prices matches
        optimalTrade = bisection(func, EPSILON, 1 - R1 - EPSILON) // bisect
      } else {
        optimalTrade = 1 - R1
      }

      console.log(`\n   Optimal trade is: ${optimalTrade}`)
      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)

      // Step 6a. Do the virtual swap, which will return an amount out of riskless
      const { deltaOut } = pool.virtualSwapAmountInRisky(optimalTrade)

      // Step 7a. Calculate the profit of the swap, by comparing the amount of
      // riskless out (received) and risky in * price of risky in riskless (paid)
      const profit = deltaOut.float - optimalTrade.float * spot.float
      console.log(`   Sell profit: ${profit}`)

      // Step 8a. Check the profit condition
      if (profit > 0) {
        // Step 9a. Do the swap if profit condition is met
        pool.swapAmountInRisky(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed / Math.pow(10, 18)}`)
      }
    } else if (buyPriceRisky < spot.float - this.optimalAmount) {
      // Step 4b. Get a function to check if we are close to reference spot price
      /**
       * @returns Difference of pool spot price and reference spot price
       */
      const func = (amountIn) => {
        return spot.float - pool.getMarginalPriceSwapStableIn(amountIn)
      }

      // Step 5b. Get the optimal amount to trade in such that pool spot === reference spot
      let optimalTrade
      if (Math.sign(func(EPSILON)) != Math.sign(func(strike.float - R2 - EPSILON))) {
        optimalTrade = bisection(func, 0, strike.float - R2 - EPSILON) //bisect func
      } else {
        optimalTrade = strike.float - R2
      }
      console.log(`\n   Optimal trade is: ${optimalTrade}`)
      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)

      // Step 6b. Do the virtual swap, which will return an amount out of risky
      const { deltaOut } = pool.virtualSwapAmountInStable(optimalTrade)
      console.log(`   Got delta out of ${deltaOut.float}`)

      // Step 7b. Calculate the profit of the swap, by comparing the amount of
      // risky out * price of risky in riskless (received) and riskless in (paid)
      const profit = deltaOut.float * spot.float - optimalTrade.float
      console.log(`   Buy profit: ${profit}`)

      // Step 8b. Check the profit condition
      if (profit > 0) {
        // Step 9b. Do the swap if profit condition is met
        pool.swapAmountInStable(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed / Math.pow(10, 18)}`)
      }
    }

    console.log(`\n   --------------- End Arb ---------------`)
  }
}
