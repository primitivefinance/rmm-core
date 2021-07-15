import numeric from 'numeric'
import { Engine, SwapReturn } from './Engine'
import { getInverseTradingFunction, getTradingFunction, calcInvariant } from '../../ReplicationMath'
import { Integer64x64, Percentage, Time, Wei, parseWei, parseInt64x64 } from 'web3-units'
import { inverse_std_n_cdf, std_n_cdf, quantilePrime } from '../../CumulativeNormalDistribution'

export const nonNegative = (x: number): boolean => {
  return x >= 0
}

export const clonePool = (poolToClone: Pool, newRisky: Wei, newStable: Wei): Pool => {
  return new Pool(
    poolToClone.entity,
    newRisky,
    newStable,
    poolToClone.strike,
    poolToClone.sigma,
    poolToClone.maturity,
    poolToClone.lastTimestamp
  )
}

/**
 * @notice Typescript representation of an individual Pool in an Engine
 */
export class Pool {
  public readonly entity: Engine
  public readonly liquidity: Wei
  public readonly strike: Wei
  public readonly sigma: Percentage
  public readonly maturity: Time
  public reserveRisky: Wei
  public reserveStable: Wei
  public lastTimestamp: Time
  public accruedFees: [Wei, Wei]
  public invariant: Integer64x64
  public tau: Time

  /**
   * @notice Builds a typescript representation of a single curve within an Engine contract
   * @param entity Engine typescript representation class which this Pool is in
   * @param initialRisky Reserve amount to initialize the pool's risky tokens
   * @param liquidity Total liquidity supply to initialize the pool with
   * @param strike Strike price of option
   * @param sigma Implied volatility of option
   * @param maturity Timestamp of option maturity
   * @param lastTimestamp Timestamp last used to calculate the time until maturity
   */
  constructor(
    entity: Engine,
    initialRisky: Wei,
    liquidity: Wei,
    strike: Wei,
    sigma: Percentage,
    maturity: Time,
    lastTimestamp: Time
  ) {
    this.entity = entity
    // ===== State =====
    this.reserveRisky = initialRisky
    this.liquidity = liquidity
    this.strike = strike
    this.sigma = sigma
    this.maturity = maturity
    this.lastTimestamp = lastTimestamp
    // ===== Calculations using State ====-
    this.tau = this.calcTau() // maturity - lastTimestamp
    this.invariant = parseInt64x64(0)
    this.reserveStable = this.getStableGivenRisky(this.reserveRisky)
    this.accruedFees = [parseWei(0), parseWei(0)]
  }

  /**
   * @param reserveRisky Amount of risky tokens in reserve
   * @return reserveStable Expected amount of stable token reserves
   */
  getStableGivenRisky(reserveRisky: Wei): Wei {
    const invariant = Math.floor(this.invariant.parsed) / Math.pow(10, 18)
    console.log(
      Math.abs(invariant) >= 1e-8,
      invariant,
      reserveRisky.float,
      this.liquidity.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years
    )

    let stable = getTradingFunction(
      Math.abs(invariant) >= 1e-8 ? 0 : invariant,
      reserveRisky.float,
      this.liquidity.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years
    )

    stable = Math.floor(stable * Math.pow(10, 18)) / Math.pow(10, 18)
    if (isNaN(stable)) return parseWei(0)
    return parseWei(stable)
  }

  /**
   *
   * @param reserveStable Amount of stable tokens in reserve
   * @return reserveRisky Expected amount of risky token reserves
   */
  getRiskyGivenStable(reserveStable: Wei): Wei {
    const invariant = Math.floor(this.invariant.parsed) / Math.pow(10, 18)
    console.log(
      Math.abs(invariant) >= 1e-8,
      invariant,
      reserveStable.float,
      this.liquidity.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years
    )
    let risky = getInverseTradingFunction(
      Math.abs(invariant) >= 1e-8 ? 0 : invariant,
      reserveStable.float,
      this.liquidity.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years
    )
    console.log(`\n   Pool: got risky: ${risky} given stable: ${reserveStable.float}`)
    risky = Math.floor(risky * Math.pow(10, 18)) / Math.pow(10, 18)
    if (isNaN(risky)) return parseWei(0)
    return parseWei(risky)
  }

  /**
   * @return tau Calculated tau using this Pool's maturity timestamp and lastTimestamp
   */
  calcTau(): Time {
    this.tau = this.maturity.sub(this.lastTimestamp)
    return this.tau
  }

  /**
   * @return invariant Calculated invariant using this Pool's state
   */
  calcInvariant(): Integer64x64 {
    this.invariant = parseInt64x64(
      calcInvariant(
        this.reserveRisky.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        this.tau.years
      )
    )
    return this.invariant
  }

  /**
   * @notice A Risky to Stable token swap
   */
  swapAmountInRisky(deltaIn: Wei): SwapReturn {
    const reserveStableLast = this.reserveStable
    const invariantLast: Integer64x64 = this.calcInvariant()

    // 0. Calculate the new risky reserves (we know the new risky reserves because we are swapping in risky)
    const gamma = 1 - this.entity.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    this.reserveRisky = this.reserveRisky.add(deltaInWithFee)
    // 1. Calculate the new stable reserve using the new risky reserve
    this.reserveStable = this.getStableGivenRisky(this.reserveRisky)
    // 2. Calculate the new invariant with the new reserve values
    const nextInvariant = this.calcInvariant()
    // 3. Check the nextInvariant is >= invariantLast in the fee-less case, set it if valid
    if (nextInvariant.parsed < invariantLast.parsed)
      console.log('invariant not passing', `${nextInvariant.parsed} < ${invariantLast.parsed}`)

    // 4. Calculate the change in risky reserve by comparing new reserve to previous
    const reserveStable = this.reserveStable
    const deltaOut = reserveStableLast.sub(reserveStable)
    const effectivePriceOutStable = deltaOut.div(deltaIn) // stable per risky
    return {
      deltaOut,
      pool: this,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  virtualSwapAmountInRisky(deltaIn: Wei): SwapReturn {
    const gamma = 1 - this.entity.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    const newReserveRisky = this.reserveRisky.add(deltaInWithFee)
    const newReserveStable = this.getStableGivenRisky(newReserveRisky)
    const deltaOut = this.reserveStable.sub(newReserveStable)
    const effectivePriceOutStable = deltaOut.div(deltaIn)
    return {
      deltaOut,
      pool: clonePool(this, newReserveRisky, newReserveStable),
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  /**
   * @notice A Stable to Risky token swap
   */
  swapAmountInStable(deltaIn: Wei): SwapReturn {
    const reserveRiskyLast = this.reserveRisky
    const invariantLast: Integer64x64 = this.calcInvariant()

    // 0. Calculate the new risky reserve since we know how much risky is being swapped out
    const gamma = 1 - this.entity.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    this.reserveStable = this.reserveStable.add(deltaInWithFee)
    // 1. Calculate the new risky reserves using the known new stable reserves
    this.reserveRisky = this.getRiskyGivenStable(this.reserveStable)
    // 2. Calculate the new invariant with the new reserves
    const nextInvariant = this.calcInvariant()
    // 3. Check the nextInvariant is >= invariantLast
    if (nextInvariant.parsed < invariantLast.parsed)
      console.log('invariant not passing', `${nextInvariant.parsed} < ${invariantLast.parsed}`)
    // 4. Calculate the change in risky reserve by comparing new reserve to previous
    const reserveRisky = this.reserveRisky
    const deltaOut = reserveRiskyLast.sub(reserveRisky)
    const effectivePriceOutStable = deltaIn.div(deltaOut) // stable per risky
    return {
      deltaOut,
      pool: this,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  virtualSwapAmountInStable(deltaIn: Wei): SwapReturn {
    const gamma = 1 - this.entity.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    const newReserveStable = this.reserveStable.add(deltaInWithFee)
    const newReserveRisky = this.getRiskyGivenStable(newReserveStable)
    const deltaOut = this.reserveRisky.sub(newReserveRisky)
    const effectivePriceOutStable = deltaIn.div(deltaOut)
    return {
      deltaOut,
      pool: clonePool(this, newReserveRisky, newReserveStable),
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  getSpotPrice(): Wei {
    const liquidity = this.liquidity.float
    const strike = this.strike.float
    const sigma = this.sigma.float
    const tau = this.tau.years
    const fn = function (x: number[]) {
      return calcInvariant(x[0], x[1], liquidity, strike, sigma, tau)
    }
    if (isNaN(fn([this.reserveRisky.float, this.reserveStable.float]))) return parseWei(0)
    const spot = numeric.gradient(fn, [this.reserveRisky.float, this.reserveStable.float])
    //console.log({ spot }, [x[0].float, x[1].float], spot[0] / spot[1])
    return parseWei(spot[0] / spot[1])
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of risky token to add to risky reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapRiskyIn(amountIn) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - this.entity.fee
    const reserveRisky = this.reserveRisky.float / this.liquidity.float
    const invariant = this.invariant
    const strike = this.strike
    const sigma = this.sigma
    const tau = this.tau
    const step0 = 1 - reserveRisky - gamma * amountIn
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step2 = quantilePrime(step0)

    return gamma * strike.float * step1 * step2
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of stable token to add to stable reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapStableIn(amountIn) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - this.entity.fee
    const reserveStable = this.reserveStable.float / this.liquidity.float
    const invariant = this.invariant
    const strike = this.strike
    const sigma = this.sigma
    const tau = this.tau
    const step0 = (reserveStable + gamma * amountIn - invariant.parsed / Math.pow(10, 18)) / strike.float
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step3 = inverse_std_n_cdf(step0)
    const step4 = std_n_cdf(step3 + step1)
    const step5 = step0 * (1 / strike.float)
    const step6 = quantilePrime(step5)
    const step7 = gamma * step4 * step6
    //console.log({ step0, step1, step3, step4, step5, step6, step7 }, 1 / step7)
    return 1 / step7
  }
}
