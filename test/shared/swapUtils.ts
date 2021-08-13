import { Wei, Percentage, Time, Integer64x64, parseInt64x64, parseWei, toBN } from 'web3-units'
import { quantilePrime, std_n_pdf, std_n_cdf, inverse_std_n_cdf, nonNegative } from '@primitivefinance/v2-math'
import { getStableGivenRisky, getRiskyGivenStable, calcInvariant } from '@primitivefinance/v2-math'

export const clonePool = (poolToClone: Pool, newRisky: Wei, newStable: Wei): Pool => {
  return new Pool(
    newRisky,
    poolToClone.liquidity,
    poolToClone.strike,
    poolToClone.sigma,
    poolToClone.maturity,
    poolToClone.lastTimestamp,
    poolToClone.fee,
    newStable ?? newStable
  )
}

export interface SwapReturn {
  deltaOut: Wei
  pool: Pool
  effectivePriceOutStable?: Wei
}

export interface DebugReturn extends SwapReturn {
  invariantLast?: Integer64x64
  gamma?: number
  deltaInWithFee?: Wei
  nextInvariant?: Integer64x64
}

export class Pool {
  public readonly liquidity: Wei
  public readonly strike: Wei
  public readonly sigma: Percentage
  public readonly maturity: Time
  public fee: number
  public reserveRisky: Wei
  public reserveStable: Wei
  public lastTimestamp: Time
  public invariant: Integer64x64
  public tau: Time
  public debug: boolean = false

  /**
   * @notice Builds a typescript representation of a single curve within an Engine contract
   * @param initialRisky Reserve amount to initialize the pool's risky tokens
   * @param liquidity Total liquidity supply to initialize the pool with
   * @param strike Strike price of option
   * @param sigma Implied volatility of option
   * @param maturity Timestamp of option maturity
   * @param lastTimestamp Timestamp last used to calculate the time until maturity
   * @param fee Price paid on swaps
   * @param overrideStable The initial stable reserve value
   */
  constructor(
    initialRisky: Wei,
    liquidity: Wei,
    strike: Wei,
    sigma: Percentage,
    maturity: Time,
    lastTimestamp: Time,
    fee: number,
    overrideStable?: Wei
  ) {
    // ===== State =====
    this.fee = fee
    this.reserveRisky = initialRisky
    this.liquidity = liquidity
    this.strike = strike
    this.sigma = sigma
    this.maturity = maturity
    this.lastTimestamp = lastTimestamp
    // ===== Calculations using State ====-
    this.tau = this.calcTau() // maturity - lastTimestamp
    this.invariant = parseInt64x64(0)
    this.reserveStable = overrideStable ? overrideStable : this.getStableGivenRisky(this.reserveRisky)
  }

  /**
   * @param reserveRisky Amount of risky tokens in reserve
   * @return reserveStable Expected amount of stable token reserves
   */
  getStableGivenRisky(reserveRisky: Wei, noInvariant?: boolean): Wei {
    let invariant = this.invariant.parsed
    invariant = Math.abs(invariant) >= 1e-8 ? invariant : 0
    if (this.debug)
      console.log(
        'invariant: ',
        invariant,
        'risky: ',
        reserveRisky.float / this.liquidity.float,
        'liquidity: ',
        this.liquidity.float,
        'strike: ',
        this.strike.float,
        'sigma: ',
        this.sigma.float,
        'tau: ',
        this.tau.years
      )

    let stable = getStableGivenRisky(
      reserveRisky.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years,
      noInvariant ? 0 : invariant
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
  getRiskyGivenStable(reserveStable: Wei, noInvariant?: boolean): Wei {
    let invariant = this.invariant.parsed
    invariant = Math.abs(invariant) >= 1e-8 ? invariant : 0
    if (this.debug)
      console.log(
        'invariant: ',
        invariant,
        'stable: ',
        reserveStable.float,
        'liquidity: ',
        this.liquidity.float,
        'strike: ',
        this.strike.float,
        'sigma: ',
        this.sigma.float,
        'tau: ',
        this.tau.years
      )
    let risky = getRiskyGivenStable(
      reserveStable.float,
      this.strike.float,
      this.sigma.float,
      this.tau.years,
      noInvariant ? 0 : invariant
    )
    if (this.debug) console.log(`\n   Pool: got risky: ${risky} given stable: ${reserveStable.float / this.liquidity.float}`)
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
    const risky = this.reserveRisky.float / this.liquidity.float
    const stable = this.reserveStable.float / this.liquidity.float
    let invariant = calcInvariant(risky, stable, this.strike.float, this.sigma.float, this.tau.years)
    invariant = Math.floor(invariant * Math.pow(10, 18))
    this.invariant = new Integer64x64(toBN(invariant).mul(Integer64x64.Denominator).div(parseWei(1).raw))
    return this.invariant
  }

  get defaultSwapReturn(): SwapReturn {
    return { deltaOut: parseWei(0), pool: this, effectivePriceOutStable: parseWei(0) }
  }

  /**
   * @notice A Risky to Stable token swap
   */
  swapAmountInRisky(deltaIn: Wei, debug?: boolean): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reserveStableLast = this.reserveStable
    const reserveRiskyLast = this.reserveRisky
    const invariantLast: Integer64x64 = this.calcInvariant()

    // 0. Calculate the new risky reserves (we know the new risky reserves because we are swapping in risky)
    const gamma = 1 - this.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    // 1. Calculate the new stable reserve using the new risky reserve
    const newRiskyReserve = reserveRiskyLast.add(deltaInWithFee).mul(parseWei(1)).div(this.liquidity)
    const newReserveStable = this.getStableGivenRisky(newRiskyReserve).mul(this.liquidity).div(parseWei(1))
    if (newReserveStable.raw.isNegative()) return this.defaultSwapReturn
    const deltaOut = reserveStableLast.sub(newReserveStable)

    this.reserveRisky = this.reserveRisky.add(deltaIn)
    this.reserveStable = this.reserveStable.sub(deltaOut)
    // 2. Calculate the new invariant with the new reserve values
    const nextInvariant = this.calcInvariant()
    // 3. Check the nextInvariant is >= invariantLast in the fee-less case, set it if valid
    if (nextInvariant.percentage < invariantLast.percentage)
      console.log('invariant not passing', `${nextInvariant.percentage} < ${invariantLast.percentage}`)

    const effectivePriceOutStable = deltaOut.mul(parseWei(1)).div(deltaIn) // stable per risky

    return { invariantLast, gamma, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutStable }
  }

  virtualSwapAmountInRisky(deltaIn: Wei): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const gamma = 1 - this.fee
    const reserveRiskyLast = this.reserveRisky
    const reserveStableLast = this.reserveStable
    const invariantLast: Integer64x64 = this.calcInvariant()
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)

    const newReserveRisky = reserveRiskyLast.add(deltaInWithFee).mul(parseWei(1)).div(this.liquidity)
    const newReserveStable = this.getStableGivenRisky(newReserveRisky).mul(this.liquidity).div(parseWei(1))
    if (newReserveStable.raw.isNegative()) return this.defaultSwapReturn
    const deltaOut = reserveStableLast.sub(newReserveStable)

    const risky = reserveRiskyLast.add(deltaIn).float / this.liquidity.float
    const stable = reserveStableLast.sub(deltaOut).float / this.liquidity.float
    let nextInvariant: any = calcInvariant(risky, stable, this.strike.float, this.sigma.float, this.tau.years)
    nextInvariant = Math.floor(nextInvariant * Math.pow(10, 18))
    nextInvariant = new Integer64x64(toBN(nextInvariant).mul(Integer64x64.Denominator).div(parseWei(1).raw))
    const effectivePriceOutStable = deltaOut.mul(parseWei(1)).div(deltaIn)
    return { invariantLast, gamma, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutStable }
  }

  /**
   * @notice A Stable to Risky token swap
   */
  swapAmountInStable(deltaIn: Wei, debug?: boolean): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const reserveRiskyLast = this.reserveRisky
    const reserveStableLast = this.reserveStable
    const invariantLast: Integer64x64 = this.calcInvariant()

    // 0. Calculate the new risky reserve since we know how much risky is being swapped out
    const gamma = 1 - this.fee
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)
    // 1. Calculate the new risky reserves using the known new stable reserves
    const newStableReserve = reserveStableLast.add(deltaInWithFee).mul(parseWei(1)).div(this.liquidity)
    const newReserveRisky = this.getRiskyGivenStable(newStableReserve).mul(this.liquidity).div(parseWei(1))
    if (newReserveRisky.raw.isNegative()) return this.defaultSwapReturn
    const deltaOut = reserveRiskyLast.sub(newReserveRisky)

    this.reserveStable = this.reserveStable.add(deltaIn)
    this.reserveRisky = this.reserveRisky.sub(deltaOut)
    // 2. Calculate the new invariant with the new reserves
    const nextInvariant = this.calcInvariant()
    // 3. Check the nextInvariant is >= invariantLast
    if (nextInvariant.parsed < invariantLast.parsed)
      console.log('invariant not passing', `${nextInvariant.parsed} < ${invariantLast.parsed}`)
    // 4. Calculate the change in risky reserve by comparing new reserve to previous
    const effectivePriceOutStable = deltaIn.mul(parseWei(1)).div(deltaOut) // stable per risky

    return { invariantLast, gamma, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutStable }
  }

  virtualSwapAmountInStable(deltaIn: Wei): DebugReturn {
    if (deltaIn.raw.isNegative()) return this.defaultSwapReturn
    const gamma = 1 - this.fee
    const reserveRiskyLast = this.reserveRisky
    const reserveStableLast = this.reserveStable
    const invariantLast: Integer64x64 = this.calcInvariant()
    const deltaInWithFee = deltaIn.mul(gamma * Percentage.Mantissa).div(Percentage.Mantissa)

    const newStableReserve = reserveStableLast.add(deltaInWithFee).mul(parseWei(1)).div(this.liquidity)
    const newReserveRisky = this.getRiskyGivenStable(newStableReserve).mul(this.liquidity).div(parseWei(1))
    if (newReserveRisky.raw.isNegative()) return this.defaultSwapReturn
    const deltaOut = reserveRiskyLast.sub(newReserveRisky)
    const risky = reserveRiskyLast.sub(deltaOut).float / this.liquidity.float
    const stable = reserveStableLast.add(deltaIn).float / this.liquidity.float
    let nextInvariant: any = calcInvariant(risky, stable, this.strike.float, this.sigma.float, this.tau.years)
    nextInvariant = Math.floor(nextInvariant * Math.pow(10, 18))
    nextInvariant = new Integer64x64(toBN(nextInvariant).mul(Integer64x64.Denominator).div(parseWei(1).raw))
    const effectivePriceOutStable = deltaIn.mul(parseWei(1)).div(deltaOut)
    return { invariantLast, gamma, deltaInWithFee, nextInvariant, deltaOut, pool: this, effectivePriceOutStable }
  }

  getSpotPrice(): Wei {
    const risky = this.reserveRisky.float / this.liquidity.float
    const strike = this.strike.float
    const sigma = this.sigma.float
    const tau = this.tau.years
    const spot = getStableGivenRisky(risky, strike, sigma, tau) * quantilePrime(1 - risky)
    return parseWei(spot)
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of risky token to add to risky reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapRiskyIn(amountIn) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - this.fee
    const reserveRisky = this.reserveRisky.float / this.liquidity.float
    const invariant = this.invariant
    const strike = this.strike
    const sigma = this.sigma
    const tau = this.tau
    const step0 = 1 - reserveRisky - gamma * amountIn
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step2 = quantilePrime(step0)
    const step3 = gamma * strike.float
    const step4 = inverse_std_n_cdf(step0)
    const step5 = std_n_pdf(step4 - step1)
    return step3 * step5 * step2
  }

  /**
   * @notice See https://arxiv.org/pdf/2012.08040.pdf
   * @param amountIn Amount of stable token to add to stable reserve
   * @return Marginal price after a trade with size `amountIn` with the current reserves.
   */
  getMarginalPriceSwapStableIn(amountIn) {
    if (!nonNegative(amountIn)) return 0
    const gamma = 1 - this.fee
    const reserveStable = this.reserveStable.float / this.liquidity.float
    const invariant = this.invariant
    const strike = this.strike
    const sigma = this.sigma
    const tau = this.tau
    const step0 = (reserveStable + gamma * amountIn - invariant.parsed / Math.pow(10, 18)) / strike.float
    const step1 = sigma.float * Math.sqrt(tau.years)
    const step3 = inverse_std_n_cdf(step0)
    const step4 = std_n_pdf(step3 + step1)
    const step5 = step0 * (1 / strike.float)
    const step6 = quantilePrime(step5)
    const step7 = gamma * step4 * step6
    //console.log({ step0, step1, step3, step4, step5, step6, step7 }, 1 / step7)
    return 1 / step7
  }
}
