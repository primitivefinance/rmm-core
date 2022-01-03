import {
  callDelta,
  getInvariantApproximation,
  getMarginalPriceSwapRiskyInApproximation,
  getMarginalPriceSwapStableInApproximation,
  getRiskyGivenStable,
  getRiskyGivenStableApproximation,
  getSpotPriceApproximation,
  getStableGivenRiskyApproximation,
} from '@primitivefi/rmm-math'
import { Floating, parseWei, Wei } from 'web3-units'

/**
 * Copied from {@link https://github.com/primitivefinance/rmm-sdk/blob/main/src/entities/swaps.ts}
 *
 * @remarks
 * The rmm-sdk uses this rmm-core package as a dependency. The sdk has models of the smart contracts,
 * making it easier to derive information like swap amounts. This is used in the core smart contract tests as well.
 */

/** Post-swap invariant and implied price after a swap. */
export interface SwapResult {
  /** Post-swap invariant of the pool. */
  invariant: number

  /** Price of the asset paid from the swap. */
  priceIn: string
}

export interface ExactInResult extends SwapResult {
  /** Amount of tokens output from a swap. */
  output: number
}

export interface ExactOutResult extends SwapResult {
  /** Amount of tokens input to a swap. */
  input: number
}

/** Static functions to compute swap in/out amounts and marginal prices. */
export class Swaps {
  // --- Max Swap Amounts in ---
  static getMaxDeltaIn(
    riskyForStable: boolean,
    reserveRiskyWei: Wei,
    reserveStableWei: Wei,
    reserveLiquidityWei: Wei,
    strikeWei: Wei
  ): Wei {
    if (riskyForStable) {
      const riskyPerLiquidity = reserveRiskyWei.mul(1e18).div(reserveLiquidityWei)
      return parseWei(1, reserveRiskyWei.decimals).sub(riskyPerLiquidity).mul(reserveLiquidityWei).div(1e18)
    } else {
      const stablePerLiquidity = reserveStableWei.mul(1e18).div(reserveLiquidityWei)
      return strikeWei.sub(stablePerLiquidity).mul(reserveLiquidityWei).div(1e18)
    }
  }

  static getMaxDeltaOut(riskyForStable: boolean, reserveRiskyWei: Wei, reserveStableWei: Wei, strikeWei: Wei): Wei {
    if (riskyForStable) {
      return reserveStableWei.sub(1)
    } else {
      return reserveRiskyWei.sub(1)
    }
  }

  /**
   * Gets price of risky token denominated in stable token.
   *
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   */
  public static getReportedPriceOfRisky(
    reserveRiskyFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number
  ): number {
    return getSpotPriceApproximation(reserveRiskyFloating, strikeFloating, sigmaFloating, tauYears)
  }

  // --- Computing Reserves ---

  /**
   * Gets estimated risky token reserves given a reference price of the risky asset, for 1 unit of liquidity.
   *
   * @remarks
   * Equal to the Delta (option greeks) exposure of one liquidity unit.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param referencePriceOfRisky Price of the risky token denominated in the stable token.
   *
   * @beta
   */
  public static getRiskyReservesGivenReferencePrice(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    referencePriceOfRisky: number
  ): number {
    return 1 - callDelta(strikeFloating, sigmaFloating, tauYears, referencePriceOfRisky)
  }

  /**
   * Gets risky reserves given stable reserves, for 1 unit of liquidity.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param reserveStableFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param invariantFloating Computed invariant of curve as a floating point decimal number.
   *
   * @beta
   */
  public static getRiskyGivenStable(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    reserveStableFloating: number,
    invariantFloating = 0
  ): number | undefined {
    const stable = getRiskyGivenStableApproximation(
      reserveStableFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      invariantFloating
    )

    if (isNaN(stable)) return undefined
    return stable
  }

  /**
   * Gets estimated stable token reserves given risky token reserves, for 1 unit of liquidity.
   *
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param invariantFloating Computed invariant of curve as a floating point decimal number.
   *
   * @beta
   */
  public static getStableGivenRisky(
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    reserveRiskyFloating: number,
    invariantFloating = 0
  ): number | undefined {
    const stable = getStableGivenRiskyApproximation(
      reserveRiskyFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      invariantFloating
    )

    if (isNaN(stable)) return undefined
    return stable
  }

  // --- Computing Change in Marginal Price ---

  /**
   * Gets marginal price after an exact trade in of the risky asset with size `amountIn`.
   *
   * {@link https://arxiv.org/pdf/2012.08040.pdf}
   *
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param amountIn Amount of risky token to add to risky reserve.
   *
   * @beta
   */
  public static getMarginalPriceSwapRiskyIn(
    reserveRiskyFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    gammaFloating: number,
    amountIn: number
  ) {
    return getMarginalPriceSwapRiskyInApproximation(
      amountIn,
      reserveRiskyFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      1 - gammaFloating
    )
  }

  /**
   * Gets marginal price after an exact trade in of the stable asset with size `amountIn`.
   *
   * {@link https://arxiv.org/pdf/2012.08040.pdf}
   *
   * @param reserveStableFloating Amount of stable tokens in reserve as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param amountIn Amount of stable token to add to stable reserve.
   *
   * @beta
   */
  public static getMarginalPriceSwapStableIn(
    invariantFloating: number,
    reserveStableFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    tauYears: number,
    gammaFloating: number,
    amountIn: number
  ) {
    return getMarginalPriceSwapStableInApproximation(
      amountIn,
      invariantFloating,
      reserveStableFloating,
      strikeFloating,
      sigmaFloating,
      tauYears,
      1 - gammaFloating
    )
  }

  /**
   * Gets output amount of stable tokens given an exact amount of risky tokens in.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountIn Amount of risky token to add to risky reserve.
   * @param decimalsRisky Decimal places of the risky token.
   * @param decimalsStable Decimal places of the stable token.
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param reserveStableFloating Amount of stable tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactRiskyInput(
    amountIn: number,
    decimalsRisky: number,
    decimalsStable: number,
    reserveRiskyFloating: number,
    reserveStableFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactInResult {
    if (amountIn < 0) throw new Error(`Amount in cannot be negative: ${amountIn}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reserveRiskyFloating, decimalsRisky)
    const y = Floating.from(reserveStableFloating, decimalsStable)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const x1 = x.add(amountIn * gamma).div(l)

    const yAdjusted = Swaps.getStableGivenRisky(x1.normalized, K, sigma, tau, k)
    if (typeof yAdjusted === 'undefined')
      throw new Error(`Next stable reserves are undefined: ${[yAdjusted, x1.normalized, K, sigma, tau, k]}`)

    const y1 = Floating.from(yAdjusted, decimalsStable).mul(l) // liquidity normalized

    const output = y.sub(y1.normalized)
    if (output.normalized < 0) throw new Error(`Reserves cannot be negative: ${output.normalized}`)

    const res0 = x.add(amountIn).div(l)
    const res1 = y.sub(output).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    const priceIn = output.div(amountIn).normalized.toString()

    return {
      output: output.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets output amount of risky tokens given an exact amount of stable tokens in.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountIn Amount of stable tokens to add to stable reserve.
   * @param decimalsRisky Decimal places of the risky token.
   * @param decimalsStable Decimal places of the stable token.
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param reserveStableFloating Amount of stable tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactStableInput(
    amountIn: number,
    decimalsRisky: number,
    decimalsStable: number,
    reserveRiskyFloating: number,
    reserveStableFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactInResult {
    if (amountIn < 0) throw new Error(`Amount in cannot be negative: ${amountIn}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reserveRiskyFloating, decimalsRisky)
    const y = Floating.from(reserveStableFloating, decimalsStable)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const y1 = y.add(amountIn * gamma).div(l)

    // note: for some reason, the regular non approximated fn outputs less
    const xAdjusted = getRiskyGivenStable(y1.normalized, K, sigma, tau, k)
    if (xAdjusted < 0) throw new Error(`Reserves cannot be negative: ${xAdjusted}`)

    const x1 = Floating.from(xAdjusted, decimalsRisky).mul(l)

    const output = x.sub(x1)
    if (output.normalized < 0) throw new Error(`Amount out cannot be negative: ${output.normalized}`)

    const res0 = x.sub(output).div(l)
    const res1 = y.add(amountIn).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    let priceIn: string
    if (amountIn === 0) priceIn = Floating.INFINITY.toString()
    else priceIn = Floating.from(amountIn, decimalsStable).div(output).normalized.toString()

    return {
      output: output.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets input amount of stable tokens given an exact amount of risky tokens out.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountOut Amount of risky tokens to remove from risky reserve.
   * @param decimalsRisky Decimal places of the risky token.
   * @param decimalsStable Decimal places of the stable token.
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param reserveStableFloating Amount of stable tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactRiskyOutput(
    amountOut: number,
    decimalsRisky: number,
    decimalsStable: number,
    reserveRiskyFloating: number,
    reserveStableFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactOutResult {
    if (amountOut < 0) throw new Error(`Amount out cannot be negative: ${amountOut}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reserveRiskyFloating, decimalsRisky)
    const y = Floating.from(reserveStableFloating, decimalsStable)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )
    const x1 = x.sub(amountOut).div(l)

    const yAdjusted = Swaps.getStableGivenRisky(K, sigma, tau, x1.normalized) // fix: doesn't use approx (which works?)
    if (typeof yAdjusted === 'undefined') throw new Error(`Adjusted stable reserve cannot be undefined: ${yAdjusted}`)

    const y1 = Floating.from(yAdjusted, decimalsStable).mul(l)

    const input = y1.sub(y)
    const inputWithFee = input.div(gamma)

    const res0 = x1
    const res1 = y.add(input).div(l)

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    let priceIn: string
    if (inputWithFee.normalized === 0) priceIn = Floating.INFINITY.toString()
    else priceIn = inputWithFee.div(amountOut).normalized.toString()

    return {
      input: inputWithFee.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }

  /**
   * Gets input amount of risky tokens given an exact amount of stable tokens out.
   *
   * {@link https://github.com/primitivefinance/rmms-py}
   *
   * @param amountOut Amount of stable tokens to remove from stable reserve.
   * @param decimalsRisky Decimal places of the risky token.
   * @param decimalsStable Decimal places of the stable token.
   * @param reserveRiskyFloating Amount of risky tokens in reserve as a floating point decimal number.
   * @param reserveStableFloating Amount of stable tokens in reserve as a floating point decimal number.
   * @param reserveLiquidityFloating Total supply of liquidity as a floating point decimal number.
   * @param strikeFloating Strike price as a floating point number in decimal format.
   * @param sigmaFloating Implied volatility as a floating point number in decimal format.
   * @param gammaFloating Equal to 10_000 - fee, in basis points as a floating point number in decimal format.
   * @param tauYears Time until expiry in years.
   *
   * @beta
   */
  public static exactStableOutput(
    amountOut: number,
    decimalsRisky: number,
    decimalsStable: number,
    reserveRiskyFloating: number,
    reserveStableFloating: number,
    reserveLiquidityFloating: number,
    strikeFloating: number,
    sigmaFloating: number,
    gammaFloating: number,
    tauYears: number
  ): ExactOutResult {
    if (amountOut < 0) throw new Error(`Amount in cannot be negative: ${amountOut}`)

    const K = strikeFloating
    const gamma = gammaFloating
    const sigma = sigmaFloating
    const tau = tauYears

    const x = Floating.from(reserveRiskyFloating, decimalsRisky)
    const y = Floating.from(reserveStableFloating, decimalsStable)
    const l = Floating.from(reserveLiquidityFloating, 18)

    // Invariant `k` must always be calculated given the curve with `tau`, else the swap happens on a mismatched curve
    const k = getInvariantApproximation(
      x.div(l).normalized, // truncates to appropriate decimals
      y.div(l).normalized,
      K,
      sigma,
      tau,
      0
    )

    const y1 = y.sub(amountOut).div(l)

    const xAdjusted = getRiskyGivenStable(y1.normalized, K, sigma, tau, k)
    if (xAdjusted < 0) throw new Error(`Adjusted risky reserves cannot be negative: ${xAdjusted}`)

    const x1 = Floating.from(xAdjusted, decimalsRisky).mul(l)

    const input = x1.sub(x)
    const inputWithFee = input.div(gamma)

    const res0 = x.add(input).div(l)
    const res1 = y1

    const invariant = getInvariantApproximation(res0.normalized, res1.normalized, K, sigma, tau, 0)
    if (invariant < k) throw new Error(`Invariant decreased by: ${k - invariant}`)

    const priceIn = Floating.from(amountOut, decimalsStable).div(inputWithFee).normalized.toString()

    return {
      input: inputWithFee.normalized,
      invariant: invariant,
      priceIn: priceIn,
    }
  }
}
