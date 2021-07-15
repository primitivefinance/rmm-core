import { constants, utils } from 'ethers'
import { BytesLike } from '@ethersproject/bytes'
/// SDK Imports
import { Pool } from './Pool'
import { Token } from './Token'
import { callDelta } from '../../BlackScholes'
import { Calibration, Position, Reserve, Margin } from '../Structs'
import { parseWei, Wei, Percentage, Time, Integer64x64 } from 'web3-units'

// ===== Interfaces =====
export interface SwapReturn {
  deltaOut: Wei
  pool: Pool
  effectivePriceOutStable?: Wei
}

export const DefaultTokens = {
  risky: new Token(1337, constants.AddressZero, 18, 'RISKY', 'RISKY'),
  stable: new Token(1337, constants.AddressZero, 18, 'STABLE', 'STABLE'),
}

// ===== Engine Class =====

/**
 * @notice Typescript Class representation of PrimitiveEngine.sol
 */
export class Engine {
  public readonly fee: number = 0.0015 // bips
  public readonly risky!: Token
  public readonly stable!: Token
  public settings!: Calibration[] | {}
  public margins!: Margin[] | {}
  public positions: Position[] | {}
  public reserves: Reserve[] | {}

  /**
   * Constructs a typescript representation to simulate an Engine
   * @param risky Risky asset as a typescript class `Token`
   * @param stable Stable asset as a typescript class `Token`
   * @param fee   Basis points to expense for swapsIn
   */
  constructor(risky: Token, stable: Token, fee?: number) {
    this.risky = risky
    this.stable = stable
    this.margins = {}
    this.settings = {}
    this.reserves = {}
    this.positions = {}
    if (fee) this.fee = fee
  }

  // ===== Initialization =====

  /**
   * @notice Sets this typescript class state to the state of an Engine contract
   * @param settings Array of mappings calibration settings using poolId keys
   * @param reserves Array of mappings of reserves using poolId keys
   * @param positions Array of mappings of positions using posId keys
   * @param margins Array of mappings of margin accounts using addresses as keys
   */
  init(settings: {}, reserves: {}, positions: {}, margins: {}) {
    this.margins = margins
    this.settings = settings
    this.reserves = reserves
    this.positions = positions
  }

  // ===== Get =====

  /**
   * @notice Fetches a Pool instance
   * @param poolId Keccak256 hash of strike, sigma, and maturity
   * @return Single typescript representation of a Pool `Pool`
   */
  getPool(poolId): Pool {
    const reserve = this.reserves[poolId]
    const setting = this.settings[poolId]
    return new Pool(
      this,
      reserve.reserveRisky,
      reserve.liquidity,
      setting.strike,
      setting.sigma,
      setting.maturity,
      setting.lastTimestamp
    )
  }

  get lastTimestamp(): number {
    return this.lastTimestamp
  }

  set lastTimestamp(timestamp) {
    this.lastTimestamp = timestamp
  }

  // ===== Create =====

  /**
   *
   * @param owner Address to increase position liquidity of
   * @param strike Strike price of option
   * @param sigma Implied volatility of option
   * @param maturity Timestamp of expiry of option
   * @param lastTimestamp Latest timestamp used to calculate time until expiry
   * @param riskyPrice Spot reference price of risky asset
   * @param delLiquidity Amount of liquidity to initialize the pool with
   * @return initialRisky Amount of risky tokens in the Pool's reserve
   * @return initialStable Amount of stable tokens in the Pool's reserve
   */
  create(
    owner: string,
    strike: Wei,
    sigma: Percentage,
    maturity: Time,
    lastTimestamp: Time,
    riskyPrice: Wei,
    delLiquidity: Wei
  ) {
    const poolId = Engine.getPoolId(strike, sigma, maturity)
    const tau = maturity.sub(lastTimestamp)
    const delta = callDelta(strike.float, sigma.float, tau.years, riskyPrice.float)
    const resRisky = parseWei(1 - delta) // 1 unit of risky reserve
    const delRisky = resRisky.mul(delLiquidity).div(parseWei('1')) // 1 * deLLiquidity units of risky reserve
    const zero = parseWei(0)
    const pool: Pool = new Pool(this, delRisky, delLiquidity, strike, sigma, maturity, lastTimestamp)
    // Commit memory pool state to storage
    this.reserves[poolId] = {
      reserveRisky: pool.reserveRisky,
      reserveStable: pool.reserveStable,
      liquidity: pool.liquidity,
      float: zero,
      debt: zero,
    }
    this.positions[Engine.getPositionId(owner, poolId)] = {
      liquidity: delLiquidity,
      float: zero,
      debt: zero,
    }
    this.settings[poolId] = {
      strike: pool.strike,
      sigma: pool.sigma,
      maturity: pool.maturity,
      lastTimestamp: pool.lastTimestamp,
    }

    return { initialRisky: pool.reserveRisky, initialStable: pool.reserveStable }
  }

  // ===== Margin =====

  /**
   * @notice Increases margin balance of `owner`
   */
  deposit(owner: string, delRisky: Wei, delStable: Wei) {
    let margin = this.margins[owner]
    margin.balanceRisky = margin.balanceRisky.add(delRisky.raw)
    margin.balanceStable = margin.balanceStable.add(delStable.raw)
  }

  /**
   * @notice Decreases margin balance of `owner`
   */
  withdraw(owner: string, delRisky: Wei, delStable: Wei) {
    let margin = this.margins[owner]
    margin.balanceRisky = margin.balanceRisky.sub(delRisky.raw)
    margin.balanceStable = margin.balanceStable.sub(delStable.raw)
  }

  // ===== Liquidity =====
  /**
   * @notice Increases liquidity balance of `owner`
   */
  allocate(poolId: BytesLike, recipient: string, delLiquidity: Wei, fromMargin?: boolean) {
    const pool: Pool = this.getPool(poolId) // memory pool
    // Calculate liquidity to provide
    const delRisky = delLiquidity.mul(pool.reserveRisky).div(pool.liquidity)
    const delStable = delLiquidity.mul(pool.reserveStable).div(pool.liquidity)
    // Commit state updates to position liquidity
    const posId = Engine.getPositionId(recipient, poolId)
    const position = this.positions[posId]
    position.liquidity = position.liquidity.add(delLiquidity)
    // Commit pool memory state to storage
    const reserve = this.reserves[poolId.toString()]
    reserve.reserveRisky = pool.reserveRisky.add(delRisky)
    reserve.reserveStable = pool.reserveStable.add(delStable)
    reserve.liquidity = pool.liquidity.add(delLiquidity)
    return { delRisky, delStable }
  }

  /**
   * @notice Decreases liquidity balance of `owner`
   */
  remove(poolId: BytesLike, owner: string, delLiquidity: Wei, toMargin?: boolean) {
    const pool: Pool = this.getPool(poolId) // get memory pool
    // Calculate liquidity to provide
    const delRisky = delLiquidity.mul(pool.reserveRisky).div(pool.liquidity)
    const delStable = delLiquidity.mul(pool.reserveStable).div(pool.liquidity)
    // Commit state updates to position liquidity
    const posId = Engine.getPositionId(owner, poolId)
    const position = this.positions[posId]
    position.liquidity = position.liquidity.sub(delLiquidity)
    // Commit pool memory state to storage
    const reserve = this.reserves[poolId.toString()]
    reserve.reserveRisky = reserve.reserveRisky.sub(delRisky)
    reserve.reserveStable = reserve.reserveStable.sub(delStable)
    reserve.liquidity = reserve.liquidity.sub(delLiquidity)
  }

  // ===== Swapping =====

  /**
   * @notice Swaps between tokens in the reserve, returning the cost of the swap as `deltaIn`
   */
  swap(poolId: BytesLike, riskyForStable: boolean, deltaIn: Wei, lastTimestamp?: number): SwapReturn {
    if (lastTimestamp) this.lastTimestamp = lastTimestamp
    const pool: Pool = this.getPool(poolId) // get a pool in memory
    const swapReturn: SwapReturn = riskyForStable ? pool.swapAmountInRisky(deltaIn) : pool.swapAmountInStable(deltaIn)
    // Commit memory state pool to storage state
    const setting = this.settings[poolId.toString()]
    setting.lastTimestamp = pool.lastTimestamp
    const reserve = this.reserves[poolId.toString()]
    reserve.reserveRisky = pool.reserveRisky
    reserve.reserveStable = pool.reserveStable
    return swapReturn
  }

  // ===== Lending =====

  /**
   * @notice Increases the float of an `owner`'s position
   */
  lend(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    const position = this.positions[Engine.getPositionId(owner, poolId)]
    // positions.lend
    position.float = position.float.add(delLiquidity)
    const reserve = this.reserves[poolId.toString()]
    // reserve.addFloat
    reserve.float = reserve.float.add(delLiquidity)
  }

  /**
   * @notice Decreases the float of an `owner`'s position
   */
  claim(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    const position = this.positions[Engine.getPositionId(owner, poolId)]
    const reserve = this.reserves[poolId.toString()]
    // positions.claim
    position.float = position.float.sub(delLiquidity)
    // reserve.removeFloat
    reserve.float = reserve.float.sub(delLiquidity)
  }

  /**
   * @notice Increases the debt of an `owner`'s position
   */
  borrow(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    const pool: Pool = this.getPool(poolId)
    const delRisky = delLiquidity.mul(pool.reserveRisky).div(pool.liquidity)
    const delStable = delLiquidity.mul(pool.reserveStable).div(pool.liquidity)
    // position.borrow
    const position = this.positions[Engine.getPositionId(owner, poolId)]
    position.debt = position.debt.add(delLiquidity)
    // reserve.borrowFloat
    const reserve = this.reserves[poolId.toString()]
    reserve.float = reserve.float.sub(delLiquidity)
    reserve.debt = reserve.debt.add(delLiquidity)
    // reserve.remove: Commit pool memory state to storage
    reserve.reserveRisky = pool.reserveRisky.sub(delRisky)
    reserve.reserveStable = pool.reserveStable.sub(delStable)
    return { delRisky, delStable }
  }

  /**
   * @notice Decreases the debt of an `owner`'s position
   */
  repay(poolId: BytesLike, owner: string, delLiquidity: Wei, fromMargin?: boolean): any {
    const pool: Pool = this.getPool(poolId)
    const delRisky = delLiquidity.mul(pool.reserveRisky).div(pool.liquidity)
    const delStable = delLiquidity.mul(pool.reserveStable).div(pool.liquidity)
    // reserve.allocate: Commit pool memory state to storage
    const reserve = this.reserves[poolId.toString()]
    reserve.reserveRisky = reserve.reserveRisky.add(delRisky)
    reserve.reserveStable = reserve.reserveStable.add(delStable)
    reserve.liquidity = reserve.liquidity.add(delLiquidity)
    // position.repay
    const position = this.positions[Engine.getPositionId(owner, poolId)]
    position.liquidity = position.liquidity.sub(delLiquidity)
    position.debt = position.debt.sub(delLiquidity)
    if (fromMargin) {
      // margin.withdraw
      const margin = this.margins[owner]
      margin.balanceRisky = margin.balanceRisky.sub(delRisky)
      margin.balanceStable = margin.balanceStable.sub(delStable)
    } else {
      // reserve.repayFloat
      reserve.float = reserve.float.add(delLiquidity)
      reserve.debt = reserve.debt.sub(delLiquidity)
    }
  }

  // ===== View =====

  /**
   * @return Keccak256 hash of owner address and poolId key
   */
  static getPositionId(owner: string, poolId: BytesLike) {
    return utils.solidityKeccak256(['string', 'bytes32'], [owner, poolId])
  }

  /**
   * @return Keccak256 hash of option curve parameters
   */
  static getPoolId(strike: Wei, sigma: Percentage, maturity: Time) {
    return utils.solidityKeccak256(['uint256', 'uint64', 'uint32'], [strike.raw, Math.floor(+sigma.float), maturity.raw])
  }
}

/// Events of the Engine
export const EngineEvents = {
  DEPOSITED: 'Deposited',
  WITHDRAWN: 'Withdrawn',
  CREATE: 'Create',
  UPDATE: 'Update',
  ADDED_BOTH: 'AddedBoth',
  REMOVED_BOTH: 'RemovedBoth',
  SWAP: 'Swap',
  LOANED: 'Loaned',
  CLAIMED: 'Claimed',
  BORROWED: 'Borrowed',
  REPAID: 'Repaid',
}

export const ERC20Events = {
  EXCEEDS_BALANCE: 'ERC20: transfer amount exceeds balance',
}
