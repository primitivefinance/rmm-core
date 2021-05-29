import hre, { ethers, waffle } from 'hardhat'
import { Wallet, constants, BigNumberish } from 'ethers'
import { Fixture } from 'ethereum-waffle'
import { PERCENTAGE, parseWei, BigNumber, Wei } from './shared/Units'
import { primitiveProtocolFixture } from './shared/fixtures'
import { expect } from 'chai'
import { IERC20, PrimitiveHouse, TestCallee, PrimitiveEngine, TestBlackScholes, IUniswapV3Pool } from '../typechain'
import { encodePriceSqrt, expandTo18Decimals, getMinTick, getMaxTick } from './shared/utilities'
import { EngineEvents, createEngineFunctions } from './shared/Engine'
import {
  DepositFunction,
  WithdrawFunction,
  LendFunction,
  AllocateFromMarginFunction,
  AllocateFromExternalFunction,
  RepayFromMarginFunction,
  createHouseFunctions,
  CreateFunction,
  BorrowFunction,
  RepayFromExternalFunction,
} from './shared/House'
import {
  Calibration,
  Reserve,
  PoolParams,
  getReserve,
  getPoolParams,
  getMargin,
  getDeltaIn,
  removeBoth,
  getPosition,
} from './shared/utilities'
import { strike, sigma, time, minTick, maxTick } from './shared/config'

const { createFixtureLoader } = waffle

describe('Primitive House tests', function () {
  const wallets = waffle.provider.getWallets()
  const [signer, signer2] = wallets

  let poolId: string
  let calibration: Calibration
  let reserve: Reserve

  let spot: Wei
  let preInvariant: BigNumber
  let postInvariant: BigNumber

  let deposit: DepositFunction
  let withdraw: WithdrawFunction
  let lend: LendFunction
  let borrow: BorrowFunction
  let allocateFromMargin: AllocateFromMarginFunction
  let allocateFromExternal: AllocateFromExternalFunction
  let create: CreateFunction
  let repayFromExternal: RepayFromExternalFunction

  let engine: PrimitiveEngine
  let callee: TestCallee
  let house: PrimitiveHouse
  let TX1: IERC20
  let TY2: IERC20
  let bs: TestBlackScholes
  let uniPool: IUniswapV3Pool

  let loadFixture: ReturnType<typeof createFixtureLoader>

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

    await callee.mint(uniPool.address, signer.address, minTick, maxTick, expandTo18Decimals(1))

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

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader(wallets)
  })

  beforeEach('load fixture', async () => {
    ;({ engine, callee, house, TX1, TY2, uniPool, bs } = await loadFixture(protocolFixture))
  })

  beforeEach(async function () {
    // init external settings
    spot = parseWei('1000')

    // House functions
    ;({
      create,
      deposit,
      withdraw,
      allocateFromExternal,
      allocateFromMargin,
      lend,
      borrow,
      repayFromExternal,
    } = createHouseFunctions({
      target: house,
      TX1,
      TY2,
      engine,
    }))

    // Create pool
    await create(strike, sigma, time, spot.raw)
    poolId = await engine.getPoolId(strike, sigma, time)
    reserve = await getReserve(engine, poolId)
    preInvariant = await engine.invariantOf(poolId)

    // name tags
    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[house.address] = 'House'
    hre.tracer.nameTags[engine.address] = 'Engine'
    hre.tracer.nameTags[TX1.address] = 'Risky Token'
    hre.tracer.nameTags[TY2.address] = 'Riskless Token'
  })

  describe('---create---', function () {
    it('House::Creates a new Curve', async function () {
      await expect(create(strike.mul(2), sigma, time, spot.raw)).to.not.be.reverted
    })
    it('House::Fails to create a new curve that already exists', async function () {
      await expect(create(strike, sigma, time, spot.raw)).to.be.reverted
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

    describe('--deposit--', function () {
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

    describe('--withdraw--', function () {
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
  describe('---Liquidity---', function () {
    this.beforeEach(async function () {})
    const deltaL = parseWei('1').raw

    const checkLiquidity = async (who: string, deltaL: BigNumberish) => {
      const { liquidity, float } = await getPosition(house, who, poolId)
      expect(liquidity.raw).to.be.eq(deltaL)
      expect(float.raw).to.be.eq(deltaL)
    }

    const checkBorrow = async (who: string, deltaL: BigNumberish) => {
      const { debt } = await getPosition(house, who, poolId)
      expect(debt.raw).to.be.eq(deltaL)
    }

    const checkRepayState = async (who: string, deltaL: BigNumberish) => {
      await getReserve(engine, poolId)
      await getPosition(house, who, poolId)
    }

    describe('--allocate--', function () {
      describe('Success Assertions', function () {
        it('House::Add liquidity from external balance', async function () {
          await allocateFromExternal(poolId, signer.address, deltaL)
        })

        it('House::Add liquidity from margin account', async function () {
          await deposit(signer.address, BigNumber.from(parseWei('1000').raw), BigNumber.from(parseWei('1000').raw))
          await allocateFromMargin(poolId, signer.address, deltaL)
        })
      })

      describe('Failure Assertions', function () {
        it('House::Fail to liquidity from margin account due to insufficient balance', async function () {
          await expect(allocateFromMargin(poolId, signer.address, deltaL.mul(100))).to.be.reverted
        })
      })
    })

    describe('--lend--', function () {
      describe('Success Assertions', function () {
        it('House::Add float from signer', async function () {
          await lend(poolId, signer.address, deltaL)
          await checkLiquidity(signer.address, deltaL)
        })
      })

      describe('Failure Assertions', function () {})
    })

    describe('--borrow--', function () {
      describe('Success Assertions', function () {
        it('House::Split LP shares and provide premium in risky asset', async function () {
          await borrow(poolId, signer.address, deltaL)
          await checkBorrow(signer.address, deltaL)
        })
      })
    })

    describe('--repay--', function () {
      describe('Success Assertions', function () {
        it('House::Repay borrow', async function () {
          await borrow(poolId, signer.address, deltaL)
          await repayFromExternal(poolId, signer.address, deltaL)
        })
      })
    })
  })
})
