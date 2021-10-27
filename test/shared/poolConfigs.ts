import { Calibration } from './calibration'
import { Time, parsePercentage } from 'web3-units'

export interface PoolState {
  description: string
  calibration: Calibration
}

export const DEFAULT_CONFIG: Calibration = new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(1 - 0.0015))
export const calibrations: any = {
  ['expired']: new Calibration(10, 1, Time.YearInSeconds, Time.YearInSeconds + 1, 10, parsePercentage(1 - 0.0015)),
  ['itm']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(1 - 0.0015)),
  ['otm']: new Calibration(5, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(1 - 0.0015)),
  ['riskyprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(1 - 0.0015), 6, 18),
  ['stableprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(1 - 0.0015), 18, 6),
  ['bothprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(1 - 0.0015), 6, 6),
}

/**
 * @notice Array of pool calibrations to test per test file
 */
export const TestPools: PoolState[] = [
  { description: 'default', calibration: DEFAULT_CONFIG },
  /* {
    description: `expired`,
    calibration: calibrations.expired,
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
    calibration: calibrations.riskyprecision,
  },
  {
    description: `6 decimal stable`,
    calibration: calibrations.stableprecision,
  }, */
  {
    description: `6 decimal risky and stable`,
    calibration: calibrations.bothprecision,
  },
]
