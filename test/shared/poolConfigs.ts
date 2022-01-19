import { Calibration, parseCalibration } from './calibration'
import { Time } from 'web3-units'

export interface PoolState {
  description: string
  calibration: Calibration
}
// --- Spots ---
const SPOT = 10

// --- Strikes ---
const ATM_STRIKE = 10
const OTM_STRIKE = 5
const ITM_STRIKE = 15

// --- Sigmas ---
const MIN_SIGMA = 0.0001 // 0.01%
const MAX_SIGMA = 10 // 1_000%
const MED_SIGMA = 1 // 100%

// --- Gammas ---
const MAX_FEE = 0.1 // 10%
const MIN_FEE = 0.0001 // 0.01%
const MED_FEE = 0.0015 // 0.15%
const MIN_GAMMA = 1 - MAX_FEE
const MAX_GAMMA = 1 - MIN_FEE
const MED_GAMMA = 1 - MED_FEE

// --- Maturities ---
const START = 1
const END = Time.YearInSeconds + 1

export const DEFAULT_CONFIG: Calibration = parseCalibration(ATM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT)
// strike, sigma, maturity, gamma, lastTimestamp, spot price, risky decimal, stable decimal
export const calibrations: any = {
  ['exp']: parseCalibration(ATM_STRIKE, MED_SIGMA, END - 1, MED_GAMMA, END, SPOT),
  ['itm']: parseCalibration(ITM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT),
  ['otm']: parseCalibration(OTM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT),
  ['mingamma']: parseCalibration(ATM_STRIKE, MED_SIGMA, END, MIN_GAMMA, START, SPOT),
  ['maxgamma']: parseCalibration(ATM_STRIKE, MED_SIGMA, END, MAX_GAMMA, START, SPOT),
  ['minsigma']: parseCalibration(ATM_STRIKE, MIN_SIGMA, END, MED_GAMMA, START, SPOT),
  ['maxsigma']: parseCalibration(ATM_STRIKE, MAX_SIGMA, END, MED_GAMMA, START, SPOT),
  ['lowdecimal0']: parseCalibration(ATM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT, 6, 18),
  ['lowdecimal1']: parseCalibration(ATM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT, 18, 6),
  ['lowdecimals']: parseCalibration(ATM_STRIKE, MED_SIGMA, END, MED_GAMMA, START, SPOT, 6, 6),
}

/**
 * @notice Array of pool calibrations to test per test file
 */
export const TestPools: PoolState[] = [
  // { description: '0.01% sigma', calibration: calibrations.minsigma },
  { description: 'default', calibration: DEFAULT_CONFIG },
  // { description: '1% fee', calibration: calibrations.mingamma },
  // { description: '10% fee', calibration: calibrations.maxgamma },
  // { description: '0.01% sigma', calibration: calibrations.minsigma },
  // {
  //   description: `6 decimal risky and stable`,
  //   calibration: calibrations.lowdecimals,
  // },
  /* {
    description: `exp`,
    calibration: calibrations.exp,
  }, */
  /* {
    description: `in the money`,
    calibration: calibrations.itm,
  },
  {
    description: `out of the money`,
    calibration: calibrations.otm,
  },
  {
    description: `6 decimal risky`,
    calibration: calibrations.lowdecimal0,
  },
  {
    description: `6 decimal stable`,
    calibration: calibrations.lowdecimal1,
  }, */
]
