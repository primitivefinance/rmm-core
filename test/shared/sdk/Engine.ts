import { ethers } from 'hardhat'
/// SDK Imports
import * as entities from './entities'
import { callDelta } from './BlackScholes'
import { Calibration, Position, Reserve, Margin } from './Structs'
import { getTradingFunction, getInverseTradingFunction, calcInvariant } from './ReplicationMath'
import { BytesLike, parseWei, Wei, Percentage, Time, Mantissa, BigNumber } from './Units'

// Typechain Imports
import { PrimitiveEngine, Token } from '../../../typechain'
import { abi as TokenAbi } from '../../../artifacts/contracts/test/Token.sol/Token.json'

// ===== Interfaces =====
interface Margins {
  [x: string]: Margin
}

export interface SwapReturn {
  deltaIn: Wei
  reserveRisky: Wei
  reserveStable: Wei
  invariant: any
}

interface SettingRaw {
  [x: string]: [BigNumber, BigNumber, number, number] & {
    strike: BigNumber
    sigma: BigNumber
    maturity: number
    lastTimestamp: number
  }
}

interface MarginRaw {
  [x: string]: [BigNumber, BigNumber] & { balanceRisky: BigNumber; balanceStable: BigNumber }
}

interface PositionRaw {
  [x: string]: [BigNumber, BigNumber, BigNumber] & {
    liquidity: BigNumber
    float: BigNumber
    debt: BigNumber
  }
}

interface ReserveRaw {
  [x: string]: [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, number, BigNumber, BigNumber, BigNumber] & {
    reserveRisky: BigNumber
    reserveStable: BigNumber
    liquidity: BigNumber
    float: BigNumber
    debt: BigNumber
    blockTimestamp: number
    cumulativeRisky: BigNumber
    cumulativeStable: BigNumber
    cumulativeLiquidity: BigNumber
  }
}

// ===== Functions to Construct Instances =====

/// @return A typescript representation of a token
const getTokenEntityFromContract = async (token: Token): Promise<entities.Token> => {
  return new entities.Token(
    (await token.provider.getNetwork()).chainId,
    token.address,
    await token.decimals(),
    await token.symbol(),
    await token.name()
  )
}

/// @return An Engine typescript class using an engine contract
export async function getEngineEntityFromContract(
  engine: PrimitiveEngine,
  poolIds: BytesLike[],
  posIds: BytesLike[],
  owners: string[]
): Promise<Engine> {
  const risky = ((await ethers.getContractAt(TokenAbi, await engine.risky())) as unknown) as Token
  const stable = ((await ethers.getContractAt(TokenAbi, await engine.stable())) as unknown) as Token
  const settings: SettingRaw[] = await Promise.all(
    poolIds.map(async (poolId) => {
      return { [poolId.toString()]: await engine.settings(poolId) }
    })
  )
  const margins: MarginRaw[] = await Promise.all(
    owners.map(async (owner) => {
      return { [owner]: await engine.margins(owner) }
    })
  )
  const reserves: ReserveRaw[] = await Promise.all(
    poolIds.map(async (poolId) => {
      return { [poolId.toString()]: await engine.reserves(poolId) }
    })
  )

  const positions: PositionRaw[] = await Promise.all(
    posIds.map(async (posId) => {
      return { [posId.toString()]: await engine.positions(posId) }
    })
  )

  const eng = new Engine(await getTokenEntityFromContract(risky), await getTokenEntityFromContract(stable))
  await eng.init(settings, reserves, positions, margins)
  return eng
}

// ===== Engine Class =====

/// @notice Typescript Class representation of PrimitiveEngine.sol
class Engine {
  public readonly risky!: entities.Token
  public readonly stable!: entities.Token
  public settings!: Calibration[] | {}
  public margins!: Margins[] | {}
  public positions: Position[] | {}
  public reserves: Reserve[] | {}

  /**
   * Constructs a typescript representation to simulate an Engine
   * @param risky Risky asset as a typescript class `Token`
   * @param stable Stable asset as a typescript class `Token`
   */
  constructor(risky: entities.Token, stable: entities.Token) {
    this.risky = risky
    this.stable = stable
    this.margins = {}
    this.settings = {}
    this.reserves = {}
    this.positions = {}
  }

  // ===== Initialization =====

  /**
   *
   * @param settings Array of mappings calibration settings using poolId keys
   * @param reserves Array of mappings of reserves using poolId keys
   * @param positions Array of mappings of positions using posId keys
   * @param margins Array of mappings of margin accounts using addresses as keys
   */
  async init(settings: SettingRaw[], reserves: ReserveRaw[], positions: PositionRaw[], margins: MarginRaw[]) {
    settings.map((setting) => this.setSettings(setting))
    reserves.map((reserve) => this.setReserves(reserve))
    positions.map((position) => this.setPositions(position))
    margins.map((margin) => this.setMargin(margin))
  }

  setMargin(margin: any) {
    let key = keyOf(margin)
    this.margins[key] = {
      balanceRisky: new Wei(margin[key].balanceRisky),
      balanceStable: new Wei(margin[key].balanceStable),
    }
  }

  setSettings(setting: any) {
    let key = keyOf(setting)
    this.settings[key] = {
      strike: new Wei(setting[key].strike),
      sigma: new Percentage(setting[key].sigma),
      maturity: new Time(setting[key].maturity),
      lastTimestamp: new Time(setting[key].lastTimestamp),
    }
  }

  setReserves(reserve: any) {
    let key = keyOf(reserve)
    this.reserves[key] = {
      reserveRisky: new Wei(reserve[key].reserveRisky),
      reserveStable: new Wei(reserve[key].reserveStable),
      liquidity: new Wei(reserve[key].liquidity),
      float: new Wei(reserve[key].float),
      debt: new Wei(reserve[key].debt),
    }
  }

  setPositions(position: any) {
    let key = keyOf(position)
    this.positions[key] = {
      float: new Wei(position[key].float),
      liquidity: new Wei(position[key].liquidity),
      debt: new Wei(position[key].debt),
    }
  }

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
    const tau = maturity.raw - lastTimestamp.raw
    const calibration = { strike: strike, sigma: sigma, maturity: maturity, lastTimestamp: lastTimestamp }
    const delta = new Mantissa(callDelta(strike.float, sigma.raw, tau, riskyPrice.float)).float
    const resRisky = parseWei(1 - delta)
    const resStable = parseWei(getTradingFunction(resRisky.float, delLiquidity.float, strike.float, sigma.raw, tau))
    const delRisky = resRisky.mul(delLiquidity).div(parseWei('1'))
    const delStable = resStable.mul(delLiquidity).div(parseWei('1'))
    const zero = new Wei(0)
    this.reserves[poolId] = {
      reserveRisky: delRisky,
      reserveStable: delStable,
      liquidity: delLiquidity,
      float: zero,
      debt: zero,
    }
    this.positions[Engine.getPositionId(owner, poolId)] = {
      balanceRisky: zero,
      balanceStable: zero,
      liquidity: delLiquidity,
      float: zero,
      debt: zero,
    }
    this.settings[poolId] = calibration

    return { initialRisky: resRisky, initialStable: resStable }
  }

  // ===== Margin =====

  /// @notice Increases margin balance of `owner`
  deposit(owner: string, delRisky: Wei, delStable: Wei) {
    let margin = this.margins[owner]
    margin.balanceRisky = margin.balanceRisky.add(delRisky.raw)
    margin.balanceStable = margin.balanceStable.add(delStable.raw)
  }

  /// @notice Decreases margin balance of `owner`
  withdraw(owner: string, delRisky: Wei, delStable: Wei) {
    let margin = this.margins[owner]
    margin.balanceRisky = margin.balanceRisky.sub(delRisky.raw)
    margin.balanceStable = margin.balanceStable.sub(delStable.raw)
  }

  // ===== Liquidity =====
  /// @notice Increases liquidity balance of `owner`
  allocate(poolId: BytesLike, recipient: string, delLiquidity: Wei, fromMargin?: boolean) {
    let reserve = this.reserves[poolId.toString()]
    let posId = Engine.getPositionId(recipient, poolId)
    let position = this.positions[posId]
    let delRisky = delLiquidity.mul(reserve.reserveRisky).div(reserve.liquidity)
    let delStable = delLiquidity.mul(reserve.reserveStable).div(reserve.liquidity)
    reserve.reserveRisky = reserve.reserveRisky.add(delRisky)
    reserve.reserveStable = reserve.reserveStable.add(delStable)
    reserve.liquidity = reserve.liquidity.add(delLiquidity)
    position.liquidity = position.liquidity.add(delLiquidity)

    return { delRisky, delStable }
  }

  /// @notice Decreases liquidity balance of `owner`
  remove(poolId: BytesLike, owner: string, delLiquidity: Wei, toMargin?: boolean) {
    let reserve = this.reserves[poolId.toString()]
    let posId = Engine.getPositionId(owner, poolId)
    let position = this.positions[posId]
    let delRisky = delLiquidity.mul(reserve.reserveRisky).div(reserve.liquidity)
    let delStable = delLiquidity.mul(reserve.reserveStable).div(reserve.liquidity)
    reserve.reserveRisky = reserve.reserveRisky.sub(delRisky)
    reserve.reserveStable = reserve.reserveStable.sub(delStable)
    reserve.liquidity = reserve.liquidity.sub(delLiquidity)
    position.liquidity = position.liquidity.sub(delLiquidity)
  }

  // ===== Swapping =====

  /// @notice Swaps between tokens in the reserve, returning the cost of the swap as `deltaIn`
  swap(poolId: BytesLike, riskyForStable: boolean, deltaOut: Wei): SwapReturn {
    let swapReturn: SwapReturn = riskyForStable
      ? this.swapRiskyForStable(poolId, deltaOut)
      : this.swapStableForRisky(poolId, deltaOut)
    return swapReturn
  }

  /// @notice A Stable to Risky token swap
  swapStableForRisky(poolId: BytesLike, deltaOut: Wei): SwapReturn {
    poolId = poolId.toString()
    const reserve: Reserve = this.reserves[poolId]
    const setting: Calibration = this.settings[poolId]
    const tau = setting.maturity.years - setting.lastTimestamp.years
    let deltaIn: Wei

    reserve.reserveRisky = reserve.reserveRisky.sub(deltaOut)
    reserve.reserveStable = parseWei(
      getTradingFunction(reserve.reserveRisky.float, reserve.liquidity.float, setting.strike.float, setting.sigma.raw, tau)
    )
    const nextInvariant = calcInvariant(
      reserve.reserveRisky.float,
      reserve.reserveStable.float,
      reserve.liquidity.float,
      setting.strike.float,
      setting.sigma.raw,
      tau
    )
    deltaIn = reserve.reserveStable.gt(reserve.reserveStable)
      ? reserve.reserveStable.sub(reserve.reserveStable)
      : reserve.reserveStable.sub(reserve.reserveStable)
    return { deltaIn, reserveRisky: reserve.reserveRisky, reserveStable: reserve.reserveStable, invariant: nextInvariant }
  }

  /// @notice A Risky to Stable token swap
  swapRiskyForStable(poolId: BytesLike, deltaOut: Wei): SwapReturn {
    poolId = poolId.toString()
    const reserve: Reserve = this.reserves[poolId]
    const setting: Calibration = this.settings[poolId]
    const tau = setting.maturity.years - setting.lastTimestamp.years
    let deltaIn: Wei

    reserve.reserveStable = reserve.reserveStable.sub(deltaOut)
    reserve.reserveRisky = parseWei(
      getInverseTradingFunction(
        reserve.reserveStable.float,
        reserve.liquidity.float,
        setting.strike.float,
        setting.sigma.raw,
        tau
      )
    )
    const nextInvariant = calcInvariant(
      reserve.reserveRisky.float,
      reserve.reserveStable.float,
      reserve.liquidity.float,
      setting.strike.float,
      setting.sigma.raw,
      tau
    )
    deltaIn = reserve.reserveRisky.gt(reserve.reserveRisky)
      ? reserve.reserveRisky.sub(reserve.reserveRisky)
      : reserve.reserveRisky.sub(reserve.reserveRisky)
    return { deltaIn, reserveRisky: reserve.reserveRisky, reserveStable: reserve.reserveStable, invariant: nextInvariant }
  }

  // ===== Lending =====

  /// @notice Increases the float of an `owner`'s position
  lend(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    let position = this.positions[Engine.getPositionId(owner, poolId)]
    let reserve = this.reserves[poolId.toString()]
    // positions.lend
    position.float = position.float.add(delLiquidity)
    // reserve.addFloat
    reserve.float = reserve.float.add(delLiquidity)
  }

  /// @notice Decreases the float of an `owner`'s position
  claim(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    let position = this.positions[Engine.getPositionId(owner, poolId)]
    let reserve = this.reserves[poolId.toString()]
    // positions.claim
    position.float = position.float.sub(delLiquidity)
    // reserve.removeFloat
    reserve.float = reserve.float.sub(delLiquidity)
  }

  /// @notice Increases the debt of an `owner`'s position
  borrow(poolId: BytesLike, owner: string, delLiquidity: Wei): any {
    let position = this.positions[Engine.getPositionId(owner, poolId)]
    let reserve = this.reserves[poolId.toString()]
    let delRisky = delLiquidity.mul(reserve.reserveRisky).div(reserve.liquidity)
    let delStable = delLiquidity.mul(reserve.reserveStable).div(reserve.liquidity)
    // position.borrow
    position.debt = position.debt.add(delLiquidity)
    position.balanceRisky = position.balanceRisky.add(delLiquidity)
    // reserve.remove
    reserve.reserveRisky = reserve.reserveRisky.sub(delRisky)
    reserve.reserveStable = reserve.reserveStable.sub(delStable)
    // reserve.borrowFloat
    reserve.float = reserve.float.sub(delLiquidity)
    reserve.debt = reserve.debt.add(delLiquidity)

    return { delRisky, delStable }
  }

  /// @notice Decreases the debt of an `owner`'s position
  repay(poolId: BytesLike, owner: string, delLiquidity: Wei, fromMargin?: boolean): any {
    let position = this.positions[Engine.getPositionId(owner, poolId)]
    let reserve = this.reserves[poolId.toString()]
    let delRisky = delLiquidity.mul(reserve.reserveRisky).div(reserve.liquidity)
    let delStable = delLiquidity.mul(reserve.reserveStable).div(reserve.liquidity)
    // reserve.allocate
    reserve.reserveRisky = reserve.reserveRisky.add(delRisky)
    reserve.reserveStable = reserve.reserveStable.add(delStable)
    reserve.liquidity = reserve.liquidity.add(delLiquidity)
    position.balanceRisky = position.balanceRisky.sub(delLiquidity)
    // position.repay
    position.liquidity = position.liquidity.sub(delLiquidity)
    position.debt = position.debt.sub(delLiquidity)
    if (fromMargin) {
      // margin.withdraw
      let margin = this.margins[owner]
      margin.balanceRisky = margin.balanceRisky.sub(delRisky)
      margin.balanceStable = margin.balanceStable.sub(delStable)
    } else {
      // reserve.repayFloat
      reserve.float = reserve.float.add(delLiquidity)
      reserve.debt = reserve.debt.sub(delLiquidity)
    }
  }

  // ===== View =====

  /// @return Keccak256 hash of owner address and poolId key
  static getPositionId(owner: string, poolId: BytesLike) {
    return ethers.utils.solidityKeccak256(['string', 'bytes32'], [owner, poolId])
  }

  /// @return Keccak256 hash of option curve parameters
  static getPoolId(strike: Wei, sigma: Percentage, maturity: Time) {
    return ethers.utils.solidityKeccak256(
      ['uint256', 'uint64', 'uint32'],
      [strike.raw, Math.floor(+sigma.float), maturity.raw]
    )
  }
}

export default Engine

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

/// @notice Utility function to return the key of a one item array object
function keyOf(object: Object) {
  return Object.keys(object)[0]
}
