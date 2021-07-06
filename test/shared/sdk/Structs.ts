/// SDK Imports
import { Wei, Percentage, Time } from './Units'

/**
 * @notice Defines a pool's parameters in the Engine
 */
export interface Calibration {
  strike: Wei
  sigma: Percentage
  maturity: Time
  lastTimestamp: Time
}

/**
 * @notice A Pool's global balance state in the Engine
 */
export interface Reserve {
  reserveRisky: Wei
  reserveStable: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
}

/**
 * @notice Global user internal balance in the Engine
 */
export interface Margin {
  balanceRisky: Wei
  balanceStable: Wei
}

/**
 * @notice Individual position data in a Pool
 */
export interface Position {
  liquidity: Wei
  float: Wei
  debt: Wei
}
