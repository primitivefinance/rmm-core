import { BigNumber } from '@ethersproject/bignumber'
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

export function parseSetting(setting: { strike: BigNumber; sigma: BigNumber; maturity: number; lastTimestamp: number }) {
  return {
    strike: new Wei(setting.strike),
    sigma: new Percentage(setting.sigma),
    maturity: new Time(setting.maturity),
    lastTimestamp: new Time(setting.lastTimestamp),
  }
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
 * @param reserve Raw reserve object returned from an Engine smart contract call
 * @returns Reserve object parsed with Wei classes
 */
export function parseReserve(reserve: {
  reserveRisky: BigNumber
  reserveStable: BigNumber
  liquidity: BigNumber
  float: BigNumber
  debt: BigNumber
}) {
  return {
    reserveRisky: new Wei(reserve.reserveRisky),
    reserveStable: new Wei(reserve.reserveStable),
    liquidity: new Wei(reserve.liquidity),
    float: new Wei(reserve.float),
    debt: new Wei(reserve.debt),
  }
}

/**
 * @notice Global user internal balance in the Engine
 */
export interface Margin {
  balanceRisky: Wei
  balanceStable: Wei
}

/**
 * @param margin Raw margin object returned from an Engine smart contract call
 * @returns Margin object parsed with Wei classes
 */
export function parseMargin(margin: { balanceRisky: BigNumber; balanceStable: BigNumber }) {
  return { balanceRisky: new Wei(margin.balanceRisky), balanceStable: new Wei(margin.balanceStable) }
}

/**
 * @notice Individual position data in a Pool
 */
export interface Position {
  liquidity: Wei
  float: Wei
  debt: Wei
}

/**
 * @param position Raw position object returned from an Engine smart contract call
 * @returns Position object parsed with Wei classes
 */
export function parsePosition(position: { float: BigNumber; liquidity: BigNumber; debt: BigNumber }) {
  return {
    float: new Wei(position.float),
    liquidity: new Wei(position.liquidity),
    debt: new Wei(position.debt),
  }
}
