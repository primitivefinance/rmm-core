import { Calibration } from '.'
import { Time, parsePercentage, Percentage, toBN } from 'web3-units'

export const DEFAULT_CONFIG: Calibration = new Calibration(10, 1, Time.YearInSeconds + 1, 1, 10, parsePercentage(0.0015))

export interface PoolState {
  description: string
  calibration: Calibration
}

export const calibrations: any = {
  ['expired']: new Calibration(10, 1, Time.YearInSeconds, Time.YearInSeconds + 1, 10),
  ['itm']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5),
  ['otm']: new Calibration(5, 1, Time.YearInSeconds + 1, 1, 10),
  ['highfee']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(0.1)),
  ['feeless']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, new Percentage(toBN(0))),
  ['riskyprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(0.0015), 6, 18),
  ['stableprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(0.0015), 18, 6),
  ['bothprecision']: new Calibration(10, 1, Time.YearInSeconds + 1, 1, 5, parsePercentage(0.0015), 6, 6),
}

/**
 * @notice Array of pools to test per test file
 */
export const TestPools: PoolState[] = [
  /* { description: 'default', calibration: DEFAULT_CONFIG },
  {
    description: `expired pool`,
    calibration: calibrations.expired,
  },
  {
    description: `in the money pool`,
    calibration: calibrations.itm,
  },
  {
    description: `out of the money pool`,
    calibration: calibrations.otm,
  },
  {
    description: `high fee pool`,
    calibration: calibrations.highfee,
  },
  {
    description: `feeless pool`,
    calibration: calibrations.feeless,
  },
  {
    description: `6 decimal risky pool`,
    calibration: calibrations.riskyprecision,
  },
  {
    description: `6 decimal stable pool`,
    calibration: calibrations.stableprecision,
  }, */
  {
    description: `6 decimal risky and stable pool`,
    calibration: calibrations.bothprecision,
  },
]
