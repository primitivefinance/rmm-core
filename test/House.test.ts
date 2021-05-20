import hre, { ethers, waffle } from 'hardhat'
import { Wallet, constants, BigNumberish } from 'ethers'
import { Fixture } from 'ethereum-waffle'
import { PERCENTAGE, parseWei, BigNumber, Wei } from './shared/Units'
import {
  DepositFunction,
  WithdrawFunction,
  LendFunction,
  AddBothFromMarginFunction,
  AddBothFromExternalFunction,
  RepayFromMarginFunction,
  RepayFromExternalFunction,
  createHouseFunctions,
} from './shared/House'
import {
  Calibration,
  Reserve,
  EngineEvents,
  PoolParams,
  getReserve,
  getPoolParams,
  addBoth,
  ERC20Events,
  getMargin,
  getDeltaIn,
  removeBoth,
  createEngineFunctions,
  CreateFunction,
} from './shared/Engine'
import { primitiveProtocolFixture } from './shared/fixtures'
import { expect } from 'chai'
import { IERC20, PrimitiveHouse, TestCallee, PrimitiveEngine, TestBlackScholes, IUniswapV3Pool } from '../typechain'
import { encodePriceSqrt, expandTo18Decimals, getMinTick, getMaxTick } from './shared/utilities'

const { createFixtureLoader } = waffle

describe('Primitive House tests', function () {
  const wallets = waffle.provider.getWallets()
  const [signer, signer2] = wallets
  // Contracts
  // Pool settings
  let poolId: string, calibration: Calibration, reserve: Reserve
  // External settings
  let spot: Wei
  // Invariant checks
  let preInvariant: BigNumber, postInvariant: BigNumber
  // Engine Functions
  let deposit: DepositFunction,
    withdraw: WithdrawFunction,
    lend: LendFunction,
    addBothFromMargin: AddBothFromMarginFunction,
    addBothFromExternal: AddBothFromExternalFunction,
    create: CreateFunction

  let loadFixture: ReturnType<typeof createFixtureLoader>

  const INITIAL_MARGIN = parseWei('1000')
  const TICK_SPACING = 60

  const protocolFixture: Fixture<{
    engine: PrimitiveEngine
    callee: TestCallee
    house: PrimitiveHouse
    TX1: IERC20
    TY2: IERC20
    bs: TestBlackScholes
    uniPool: IUniswapV3Pool
  }> = async (wallets, provider) => {
    const { engine, callee, house, uniPool, TX1, TY2, bs } = await loadFixture(primitiveProtocolFixture)

    await TX1.approve(house.address, constants.MaxUint256)
    await TX1.connect(signer2).approve(house.address, constants.MaxUint256)
    await TX1.transfer(signer2.address, BigNumber.from(1_000_000).mul(BigNumber.from(10).pow(18)))

    await TY2.approve(house.address, constants.MaxUint256)
    await TY2.connect(signer2).approve(house.address, constants.MaxUint256)
    await TY2.transfer(signer2.address, BigNumber.from(1_000_000).mul(BigNumber.from(10).pow(18)))

    await TX1.approve(callee.address, constants.MaxUint256)
    await TY2.approve(callee.address, constants.MaxUint256)

    await uniPool.initialize(encodePriceSqrt(1, 1))

    const minTick = getMinTick(TICK_SPACING)
    const maxTick = getMaxTick(TICK_SPACING)

    await callee.mint(uniPool.address, signer.address, minTick, maxTick, expandTo18Decimals(1))

    console.log(house.address, 'house')

    return {
      engine,
      callee,
      house,
      TX1,
      TY2,
      bs,
      uniPool,
    }
  }

  let engine: PrimitiveEngine
  let callee: TestCallee
  let house: PrimitiveHouse
  let TX1: IERC20
  let TY2: IERC20
  let bs: TestBlackScholes
  let uniPool: IUniswapV3Pool

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader(wallets)
  })

  beforeEach('load fixture', async () => {
    ;({ engine, callee, house, TX1, TY2, uniPool, bs } = await loadFixture(protocolFixture))
  })

  beforeEach(async function () {
    // init external settings
    spot = parseWei('1000')

    // Calibration struct
    const [strike, sigma, time] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600]
    calibration = { strike, sigma, time }

    // House functions
    ;({ deposit, withdraw, addBothFromExternal, addBothFromMargin, lend } = createHouseFunctions({
      target: house,
      TX1,
      TY2,
      engine,
    }))

    // Engine Functions
    ;({ create } = createEngineFunctions({
      target: callee,
      TX1,
      TY2,
      engine,
      bs,
    }))

    // Create pool
    await create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)
    preInvariant = await engine.getInvariantLast(poolId)

    // name tags
    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[house.address] = 'House'
    hre.tracer.nameTags[engine.address] = 'Engine'
    hre.tracer.nameTags[TX1.address] = 'Risky Token'
    hre.tracer.nameTags[TY2.address] = 'Riskless Token'
  })

  describe('#create', function () {
    it('Engine::Create: Generates a new Curve', async function () {
      const cal = { strike: parseWei('1250').raw, sigma: calibration.sigma, time: calibration.time }
      await expect(create(cal, spot.raw)).to.not.be.reverted
      const len = (await engine.getAllPoolsLength()).toString()
      const pid = await engine.allPools(+len - 1)
      const settings = await engine.getCalibration(pid)
      settings.map((val, i) => {
        const keys = Object.keys(cal)
        expect(val).to.be.eq(cal[keys[i]])
      })
    })
  })

  describe('---Margin---', () => {
    this.beforeEach(async function () {})

    const checkMargin = async (who: string, deltaX: BigNumberish, deltaY: BigNumberish) => {
      const { owner, BX1, BY2, unlocked } = await getMargin(house, who)
      expect(owner).to.be.eq(who)
      expect(BX1.raw).to.be.eq(deltaX)
      expect(BY2.raw).to.be.eq(deltaY)
      expect(unlocked).to.be.eq(false)
    }

    describe('#deposit', function () {
      const amount = parseWei('200').raw
      describe('Success Assertions', function () {
        // OWN MARGIN ACCOUNT
        it('House::Deposit 200 X to own margin account', async function () {
          await expect(deposit(signer.address, amount, 0))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, amount, 0)
          await checkMargin(signer.address, amount, 0)
        })
        it('House::Deposit 200 Y to own margin account', async function () {
          await expect(deposit(signer.address, 0, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, 0, amount)
          await checkMargin(signer.address, 0, amount)
        })
        it('House::Deposit 200 X and 200 Y to own margin account', async function () {
          await expect(deposit(signer.address, amount, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, amount, amount)
          await checkMargin(signer.address, amount, amount)
        })

        // OTHER MARGIN ACCOUNT
        it('House::Deposit 200 X to signer2 margin account', async function () {
          await expect(deposit(signer2.address, amount, 0))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, amount, 0)
          await checkMargin(signer2.address, amount, 0)
        })
        it('House::Deposit 200 Y to signer2 margin account', async function () {
          await expect(deposit(signer2.address, 0, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, 0, amount)
          await checkMargin(signer2.address, 0, amount)
        })
        it('House::Deposit 200 X and 200 Y to signer2` margin account', async function () {
          await expect(deposit(signer2.address, amount, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(house.address, house.address, amount, amount)
          await checkMargin(signer2.address, amount, amount)
        })
      })
    })

    describe('#withdraw', function () {
      const amount = parseWei('200').raw
      this.beforeEach(async function () {
        await deposit(signer.address, amount, amount)
      })
      describe('Success Assertions', function () {
        it('House::Withdraw 200 X from own margin account', async function () {
          await expect(() => withdraw(amount, 0)).to.changeTokenBalance(TX1, signer, amount)
          await checkMargin(signer.address, 0, amount)
        })
        it('House::Withdraw 200 Y from own margin account', async function () {
          await expect(() => withdraw(0, amount)).to.changeTokenBalance(TY2, signer, amount)
          await checkMargin(signer.address, amount, 0)
        })
        it('House::Withdraw 200 X and 200 Y from own margin account', async function () {
          await expect(() => withdraw(amount, amount)).to.changeTokenBalance(TX1, signer, amount)
          await checkMargin(signer.address, 0, 0)
        })
      })

      describe('Failure Assertions', function () {
        it('Fail House::Withdraw > margin balance X', async function () {
          await expect(withdraw(amount.mul(2), 0)).to.be.reverted
        })
        it('Fail House::Withdraw > margin balance Y', async function () {
          await expect(withdraw(0, amount.mul(2))).to.be.reverted
        })
      })
    })
  })
})
