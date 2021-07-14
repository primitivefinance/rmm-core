import { parseWei, Wei } from 'web3-units'
import { inverse_std_n_cdf, std_n_cdf } from '../../CumulativeNormalDistribution'
import { Pool } from './Pool'

export const quantilePrime = (x) => {
  return Math.pow(std_n_cdf(inverse_std_n_cdf(x)), -1)
}

export const EPSILON = 1e-3

// JavaScript program for implementation
// of Bisection Method for
// solving equations

// Prints root of func(x) with error of EPSILON
function bisection(func, a, b) {
  if (func(a) * func(b) >= 0) {
    console.log('\n You have not assumed' + ' right a and b')
    return
  }

  let c = a
  while (b - a >= EPSILON) {
    // Find middle point
    c = (a + b) / 2

    // Check if middle point is root
    if (func(c) == 0.0) break
    // Decide the side to repeat the steps
    else if (func(c) * func(a) < 0) b = c
    else a = c
  }
  //prints value of c upto 4 decimal places
  console.log('\n   The value of ' + 'root is : ' + c)
  return c
}

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
      if (true) {
        optimalTrade = bisection(func, EPSILON, 1 - R1 - EPSILON) // bisect
      } else {
        optimalTrade = 1 - R1
      }
      console.log(`\n   Optimal trade is: ${optimalTrade}`)
      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)
      const { deltaOut } = pool.virtualSwapAmountInRisky(optimalTrade)
      const profit = deltaOut.sub(optimalTrade.mul(spot))

      console.log(`   Sell profit: ${profit.float}`)
      if (profit.float > 0) {
        pool.swapAmountInRisky(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed}`)
      }
    } else if (buyPriceRisky < spot.float - this.optimalAmount) {
      const func = (amountIn) => {
        return spot.float - pool.getMarginalPriceSwapStableIn(amountIn)
      }

      let optimalTrade
      if (true) {
        optimalTrade = bisection(func, 0, strike.float - R2 - EPSILON) //bisect func
      } else {
        optimalTrade = strike.float - R2
      }

      optimalTrade = parseWei(Math.floor(optimalTrade * 1e18) / 1e18)

      console.log(`\n   Optimal trade is: ${optimalTrade.float}`)

      const { deltaOut } = pool.virtualSwapAmountInStable(optimalTrade)
      const profit = optimalTrade.mul(spot.float).sub(deltaOut)
      console.log(`   Buy profit: ${profit.float}`)
      if (profit.float > 0) {
        pool.swapAmountInStable(optimalTrade) // do the arbitrage
        console.log(`   Invariant after arbitrage: ${pool.invariant.parsed}`)
      }
    }

    console.log(`\n   ----- End Arb -----`)
  }
}
