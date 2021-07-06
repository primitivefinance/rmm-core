import numeric from 'numeric'
import { Engine, SwapReturn } from './Engine'
import { getInverseTradingFunction, getTradingFunction, calcInvariant } from '../ReplicationMath'
import { Integer64x64, Percentage, Time, Wei, parseWei, parseInt64x64 } from '../Units'

/**
 * @notice Typescript representation of an individual CoveredCallAMM (a pool) in an Engine
 */
export class CoveredCallAMM {
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
   *
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
    this.reserveRisky = initialRisky
    this.liquidity = liquidity
    this.strike = strike
    this.sigma = sigma
    this.maturity = maturity
    this.lastTimestamp = lastTimestamp
    this.tau = maturity.sub(lastTimestamp)
    this.reserveStable = parseWei(
      getTradingFunction(0, initialRisky.float, liquidity.float, strike.float, sigma.float, this.tau.years)
    )
    this.invariant = parseInt64x64(0)
    this.accruedFees = [parseWei(0), parseWei(0)]
  }

  getStableGivenRisky(risky: Wei): Wei {
    return parseWei(
      getTradingFunction(
        this.invariant.float,
        risky.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        this.tau.years,
        this.entity.fee
      )
    )
  }

  getRiskyGivenStable(stable: Wei): Wei {
    return parseWei(
      getInverseTradingFunction(
        this.invariant.float,
        stable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        this.tau.years,
        this.entity.fee
      )
    )
  }

  /// @notice A Risky to Stable token swap
  swapAmountOutStable(deltaOut: Wei): SwapReturn {
    const reserveRiskyLast = this.reserveRisky

    // 1. Calculate the new time until expiry `tau`
    const tau: Time = this.maturity.sub(this.lastTimestamp)

    // 2. Calculate the new invariant with the new `tau` and reserves state, set it
    const invariantLast: Integer64x64 = parseInt64x64(
      calcInvariant(
        this.reserveRisky.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )

    // 3. Calculate the new stable reserves (we know the new stable reserves because we are swapping out stables)
    this.reserveStable = this.reserveStable.sub(deltaOut)
    // 4. Calculate the new risky reserve using the new stable reserve and new invariant
    this.reserveRisky = parseWei(
      getInverseTradingFunction(
        invariantLast.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )
    // 5. Calculate the new invariant with the new reserve values and tau
    const nextInvariant = parseInt64x64(
      calcInvariant(
        this.reserveRisky.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )

    // 6. Check the nextInvariant is <= invariantLast in the fee-less case, set it if valid
    if (nextInvariant.float > invariantLast.float)
      console.log('invariant not passing', `${nextInvariant.float} > ${invariantLast.float}`)
    this.invariant = nextInvariant

    // 7. Calculate the change in risky reserve by comparing new reserve to previous
    const reserveRisky = this.reserveRisky
    const deltaIn = reserveRisky.gt(reserveRiskyLast)
      ? reserveRisky.sub(reserveRiskyLast)
      : reserveRiskyLast.sub(reserveRisky)
    const effectivePriceOutStable = deltaOut.div(deltaIn)
    return {
      deltaIn,
      reserveRisky: this.reserveRisky,
      reserveStable: this.reserveStable,
      invariant: nextInvariant,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  virtualSwapAmountOutStable(deltaOut: Wei): SwapReturn {
    const newReserveStable = this.reserveStable.sub(deltaOut)
    const newReserveRisky = this.getRiskyGivenStable(newReserveStable)
    const newInvariant = parseInt64x64(
      calcInvariant(
        newReserveRisky.float,
        newReserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        this.tau.years
      )
    )
    const deltaIn = newReserveRisky.sub(this.reserveRisky)
    const effectivePriceOutStable = deltaOut.div(deltaIn)
    return {
      deltaIn,
      reserveRisky: newReserveRisky,
      reserveStable: newReserveStable,
      invariant: newInvariant,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  swapAmountOutRisky(deltaOut: Wei): SwapReturn {
    const reserveStableLast = this.reserveStable

    // 1. Calculate the new time until expiry `tau`, set it
    const tau: Time = this.maturity.sub(this.lastTimestamp)
    this.tau = tau

    // 2. Calculate the new invariant with the new tau
    const invariantLast = parseInt64x64(
      calcInvariant(
        this.reserveRisky.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )

    // 3. Calculate the new risky reserve since we know how much risky is being swapped out
    this.reserveRisky = this.reserveRisky.sub(deltaOut)
    // 4. Calculate the new stable reserves using the known new risky reserves, and new invariant
    this.reserveStable = parseWei(
      getTradingFunction(
        invariantLast.float,
        this.reserveRisky.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )

    // 5. Calculate the new invariant with the new reserves and tau
    const nextInvariant = parseInt64x64(
      calcInvariant(
        this.reserveRisky.float,
        this.reserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        tau.years
      )
    )

    // 6. Check the nextInvariant is >= invariantLast
    if (nextInvariant.float < invariantLast.float)
      console.log('invariant not passing', `${nextInvariant.float} < ${invariantLast.float}`)
    this.invariant = nextInvariant

    // 7. Calculate the change in risky reserve by comparing new reserve to previous
    const reserveStable = this.reserveStable
    const deltaIn = reserveStableLast.gt(reserveStable)
      ? reserveStableLast.sub(reserveStable)
      : reserveStable.sub(reserveStableLast)
    const effectivePriceOutStable = deltaIn.div(deltaOut)
    return {
      deltaIn,
      reserveRisky: this.reserveRisky,
      reserveStable: this.reserveStable,
      invariant: nextInvariant,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  virtualSwapAmountOutRisky(deltaOut: Wei): SwapReturn {
    const newReserveRisky = this.reserveRisky.sub(deltaOut)
    const newReserveStable = this.getStableGivenRisky(newReserveRisky)
    const newInvariant = parseInt64x64(
      calcInvariant(
        newReserveRisky.float,
        newReserveStable.float,
        this.liquidity.float,
        this.strike.float,
        this.sigma.float,
        this.tau.years
      )
    )
    const deltaIn = newReserveStable.sub(this.reserveStable)
    const effectivePriceOutStable = deltaIn.div(deltaOut)
    return {
      deltaIn,
      reserveRisky: newReserveRisky,
      reserveStable: newReserveStable,
      invariant: newInvariant,
      effectivePriceOutStable: effectivePriceOutStable,
    }
  }

  getSpotPrice(): Wei {
    const fn = function (this, x: number[]) {
      return calcInvariant(x[0], x[1], this.liquidity.float, this.strike.float, this.sigma.float, this.tau.years)
    }
    const spot = numeric.gradient(fn, [this.reserveRisky.float, this.reserveStable.float])
    //console.log({ spot }, [x[0].float, x[1].float], spot[0] / spot[1])
    return parseWei(spot[0] / spot[1])
  }
}
