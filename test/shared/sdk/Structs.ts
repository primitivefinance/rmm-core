/// SDK Imports
import { Wei, Percentage, Time } from './Units'

export interface Calibration {
  strike: Wei
  sigma: Percentage
  time: Time
  blockTimestamp: Time
}
export interface Reserve {
  reserveRisky: Wei
  reserveStable: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
}
export interface Margin {
  balanceRisky: Wei
  balanceStable: Wei
}
export interface Position {
  balanceRisky: Wei
  balanceStable: Wei
  liquidity: Wei
  float: Wei
  debt: Wei
}
