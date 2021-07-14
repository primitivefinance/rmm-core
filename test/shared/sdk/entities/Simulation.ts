import { Pool } from './Pool'
import { Arbitrageur } from './Arb'
import { Integer64x64, parseWei, Percentage, Time, toBN, Wei } from 'web3-units'
import { constants, Contract } from 'ethers'
import { GBM } from '../generateGBM'
import { inverse_std_n_cdf, std_n_cdf } from '../../CumulativeNormalDistribution'
import { callDelta } from '../../BlackScholes'
import { getTradingFunction } from '../../ReplicationMath'
import { DefaultTokens, Engine } from './Engine'
import { Token } from './Token'
import fs from 'fs'

const EPSILON = 1e-8

interface Config {
  strike: Wei
  sigma: Percentage
  maturity: Time
  lastTimestamp: Time
}

const config: Config = {
  strike: parseWei(1100),
  sigma: new Percentage(toBN(Percentage.Mantissa * 1)), // 100%
  maturity: new Time(Time.YearInSeconds * 1), // 1 year
  lastTimestamp: new Time(0),
}

export function getRiskyReservesGivenSpotPrice(S, K, sigma, tau) {
  const delta = callDelta(K, sigma, tau, S)
  return 1 - delta
}

export function getStableGivenRisky(risky, K, sigma, tau) {
  if (risky == 0) return K
  else if (risky == 1) return 0
  return getTradingFunction(0, risky, 1, K, sigma, tau)
}

const fees = [0, 0.005]

const seeds = [5]

async function main() {
  for (const s of seeds) {
    console.log(`\n-----Start sim for seed of ${s}-----`)
    for (const fee of fees) {
      console.log(`\n-----Start sim for fee of ${fee}-----`)
      const gammaStr = (1 - fee).toString()
      const engine: Engine = new Engine(DefaultTokens.risky, DefaultTokens.stable, fee)
      const pool: Pool = new Pool(
        engine,
        parseWei(0.5),
        parseWei(1),
        config.strike,
        config.sigma,
        config.maturity,
        config.lastTimestamp
      )
      const arbitrageur: Arbitrageur = new Arbitrageur()
      const mu = 0.00003
      const T: Time = config.maturity.sub(config.lastTimestamp)
      const sigma: number = config.sigma.float / Math.sqrt(T.years)
      const spot: Wei = parseWei(1000)
      const dt = 365
      const gbm: any[] = GBM(spot.float, mu, sigma, T.years, dt, true)
      const length = gbm.length

      let spotPriceArray: number[] = []
      let minMarginalPriceArray: number[] = []
      let maxMarginalPriceArray: number[] = []
      let theoreticalLpArray: number[] = []
      let effectiveLpArray: number[] = []

      for (let i = 0; i < length - 1; i++) {
        console.log(`\nOn step: ${i} out of ${length - 1} for fee case: ${fee} and seed: ${s}`)
        let day = i
        let theoreticalTau = T.years - day / 365
        console.log(`\n Theoretical tau: ${theoreticalTau}`)
        let dtau = 1
        let spot = gbm[i]
        if (i % dtau == 0) {
          pool.tau = new Time(theoreticalTau * Time.YearInSeconds)
          pool.invariant = new Integer64x64(
            Integer64x64.Denominator.mul(pool.reserveStable.sub(pool.getRiskyGivenStable(pool.reserveRisky)).raw)
          )
          spotPriceArray.push(pool.getSpotPrice().float)
        }

        if (pool.tau.years >= 0) {
          arbitrageur.arbitrageExactly(parseWei(spot), pool)
          maxMarginalPriceArray.push(pool.getMarginalPriceSwapStableIn(0))
          minMarginalPriceArray.push(pool.getMarginalPriceSwapRiskyIn(0))
          let theoreticalRisky = getRiskyReservesGivenSpotPrice(spot, pool.strike.float, pool.sigma.float, theoreticalTau)
          let theoreticalStable = getStableGivenRisky(theoreticalRisky, pool.strike.float, pool.sigma.float, theoreticalTau)
          let theoreticalLpValue = theoreticalRisky * spot + theoreticalStable
          let effectiveLpValue = pool.reserveRisky.float * spot + pool.reserveStable.float
          theoreticalLpArray.push(theoreticalLpValue)
          effectiveLpArray.push(effectiveLpValue)
          console.log(`\n   Theoretical Lp value: ${theoreticalLpValue}`)
          console.log(`\n   Effective Lp value: ${effectiveLpValue}`)
        }
      }

      const results = {
        theoreticalLp: theoreticalLpArray,
        effectiveLp: effectiveLpArray,
        spotPrice: spotPriceArray,
        minMarginalPrice: minMarginalPriceArray,
        maxMarginalPriceArray: maxMarginalPriceArray,
      }
      console.log(`\n   Results:`)
      console.log(results)
      await updateLog(+s, +fee, results)
      console.log(`\n-----------------------------------`)
    }
    console.log(`\n-----------------------------------`)
  }
}

export async function updateLog(seed: number, fee: number, results: Object) {
  try {
    const logRaw = await fs.promises.readFile('./simulationData.json', {
      encoding: 'utf-8',
      flag: 'a+',
    })
    let log

    if (logRaw.length === 0) {
      log = {}
    } else {
      log = JSON.parse(logRaw)
    }

    if (!log[seed]) {
      log[seed] = {}
    }

    log[seed][fee] = results

    await fs.promises.writeFile('./simulationData.json', JSON.stringify(log, null, 2))
  } catch (e) {
    console.error(e)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
