import hre, { ethers, waffle } from 'hardhat'
import { Wallet, Contract } from 'ethers'
import {
  YEAR,
  PERCENTAGE,
  MANTISSA,
  DENOMINATOR,
  fromInt,
  fromPercentageInt,
  formatEther,
  parseWei,
  BigNumber,
  Wei,
  BigNumberish,
  toBN,
  percentage,
  fromMantissa,
  fromWithin,
} from './shared/Units'
import { calculateD1, calculateDelta } from './shared/BlackScholes'
import { getTradingFunction, getProportionalVol } from './shared/ReplicationMath'
import {
  Calibration,
  Position,
  Reserve,
  calculateInvariant,
  EngineEvents,
  PoolParams,
  getReserve,
  getCalibration,
  getPosition,
  getPoolParams,
  addBoth,
  ERC20Events,
  getMargin,
  getDeltaIn,
  calcRX1WithYOut,
  calcRY2WithXOut,
  Swap,
  removeBoth,
  calcRY2WithRX1,
  calcRX1WithRY2,
} from './shared/Engine'
import { engineFixture, EngineFixture } from './shared/fixtures'
import { expect } from 'chai'
import { PrimitiveEngine } from '../typechain/PrimitiveEngine'
const { createFixtureLoader } = waffle

describe('Primitive Engine', function () {
  // Contracts
  let engine: Contract, callee: Contract, house: Contract, TX1: Contract, TY2: Contract
  // Pool settings
  let poolId: string, calibration: Calibration, reserve: Reserve
  // External settings
  let nonce: number, spot: Wei
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  let loadFixture: ReturnType<typeof createFixtureLoader>

  const INITIAL_MARGIN = parseWei('1000')

  const mintTokens = async (wad, guy, spender) => {
    await TX1.mint(guy, wad.raw)
    await TY2.mint(guy, wad.raw)
    // approve tokens
    wad = new Wei(ethers.constants.MaxUint256)
    await TX1.approve(spender, wad.raw)
    await TY2.approve(spender, wad.raw)
  }

  before('Generate fixture load', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    // get contracts
    ;({ engine, callee, house, TX1, TY2 } = await loadFixture(engineFixture))
    // init external settings
    nonce = 0
    spot = parseWei('1000')
    // init pool settings
    // Calibration struct
    const strike = parseWei('1000').raw
    const sigma = 0.85 * PERCENTAGE
    const time = 31449600 //one year
    calibration = { strike, sigma, time }
    const delta = await engine.callDelta(calibration, spot.raw)
    const RX1 = parseWei(1 - fromMantissa(fromInt(delta.toString())))
    const RY2 = parseWei(getTradingFunction(RX1, parseWei('1'), calibration))
    // Create pool
    await TX1.mint(engine.address, RX1.raw)
    await TY2.mint(engine.address, RY2.raw)
    await engine.create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)

    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[callee.address] = 'Callee'
    hre.tracer.nameTags[engine.address] = 'Engine'
    hre.tracer.nameTags[TX1.address] = 'Risky Token'
    hre.tracer.nameTags[TY2.address] = 'Riskless Token'
  })

  describe('Margin', function () {
    this.beforeEach(async function () {
      await mintTokens(parseWei('25000000'), signer.address, callee.address)
    })

    describe('#deposit', function () {
      describe('sucess cases', function () {
        it('Callee::Deposit: Adds X and Y directly', async function () {
          const amount = parseWei('200').raw
          // deposit 200
          await expect(callee.deposit(amount, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(callee.address, signer.address, amount, amount)
          const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
          expect(owner).to.be.eq(signer.address)
          expect(BX1.raw).to.be.eq(amount)
          expect(BY2.raw).to.be.eq(amount)
          expect(unlocked).to.be.eq(false)
        })
      })

      describe('fail cases', function () {
        it('Fail Callee::AddX: No X balance', async function () {
          await callee.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          await expect(engine.withdraw(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)).to.emit(engine, EngineEvents.WITHDRAWN)
          await expect(callee.swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)).to.be.revertedWith(
            ERC20Events.EXCEEDS_BALANCE
          )
        })
      })
    })

    describe('#withdraw', function () {
      this.beforeEach(async function () {
        await callee.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
      })
      describe('sucess cases', function () {
        it('Engine::Withdraw: Removes X and Y directly', async function () {
          // before: deposit 100
          const amount = INITIAL_MARGIN.raw
          // remove 100
          await expect(engine.withdraw(amount, amount))
            .to.emit(engine, EngineEvents.WITHDRAWN)
            .withArgs(signer.address, signer.address, amount, amount)
          // deposit 100
          await callee.deposit(amount, amount)
          // remove 100
          await expect(() => engine.withdraw(amount, amount)).to.changeTokenBalance(TX1, signer, amount)
          const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
          expect(owner).to.be.eq(signer.address)
          expect(BX1.raw).to.be.eq(0)
          expect(BY2.raw).to.be.eq(0)
          expect(unlocked).to.be.eq(false)
        })
      })

      describe('fail cases', function () {
        it('Fail Callee::SwapYForX: No Y balance', async function () {
          // before: add initial margin
          await expect(engine.withdraw(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)).to.emit(engine, EngineEvents.WITHDRAWN)
          await expect(callee.swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)).to.be.revertedWith(
            ERC20Events.EXCEEDS_BALANCE
          )
        })
      })
    })
  })

  describe('Liquidity', function () {
    this.beforeEach(async function () {
      await mintTokens(parseWei('25000000'), signer.address, callee.address)
    })

    describe('#addBoth', function () {
      describe('sucess cases', function () {
        it('Engine::AddBoth: Add both X and Y from Balance', async function () {
          const invariant = await engine.getInvariantLast(poolId)
          const deltaL = parseWei('1')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
          await expect(callee.addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
          expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(params.reserve.RX1.add(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
          expect(params.reserve.RY2.add(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
          expect(params.reserve.liquidity.add(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
        })

        it('Engine::AddBoth: Add both X and Y from Margin', async function () {
          await callee.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const deltaL = parseWei('1')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
          await expect(callee.addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
          expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(params.reserve.RX1.add(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
          expect(params.reserve.RY2.add(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
          expect(params.reserve.liquidity.add(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
        })
      })

      describe('fail cases', function () {})
    })

    describe('#removeBoth', function () {
      this.beforeEach(async function () {
        // Add some liq to remove it
        await expect(callee.addLiquidity(poolId, nonce, parseWei('1').raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
      })
      describe('sucess cases', function () {
        it('Engine::RemoveBoth: Remove both X and Y', async function () {
          // fetch current state
          const invariant = await engine.getInvariantLast(poolId)
          const liquidity = (await getReserve(engine, poolId)).liquidity
          const deltaL = liquidity.sub(await engine.INIT_SUPPLY())
          const params: PoolParams = await getPoolParams(engine, poolId)
          const postLiquidity = liquidity.sub(deltaL)
          // calc amounts removed
          const [deltaX, deltaY, postParams, postInvariant] = removeBoth(deltaL, params)
          // remove liquidity
          await expect(engine.removeBoth(poolId, nonce, deltaL.raw, true)).to.emit(engine, 'RemovedBoth')
          expect(postInvariant).to.be.gte(parseFloat(invariant))
          expect(postLiquidity.raw).to.be.eq(postParams.reserve.liquidity.raw)
          expect(params.reserve.RX1.sub(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
          expect(params.reserve.RY2.sub(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
          expect(params.reserve.liquidity.sub(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
        })
      })

      describe('fail cases', function () {
        it('Fail Engine::RemoveBoth: No L balance', async function () {
          await expect(engine.connect(signer2).removeBoth(poolId, 0, parseWei('0.1').raw, true)).to.be.reverted
        })
      })
    })
  })

  describe('Swaps', function () {
    this.beforeEach(async function () {
      await mintTokens(parseWei('25000000'), signer.address, callee.address)
    })
    describe('#swap', function () {
      describe('sucess cases', function () {
        it('Engine::Swap: Swap X to Y from EOA', async function () {
          // before: add tokens to margin to do swaps with
          await callee.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('100')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = true
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)
          // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
          await expect(engine.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
            engine,
            EngineEvents.SWAP
          )

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
          expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
        })

        it('Engine::Swap: Swap X to Y from Callee', async function () {
          // before: add tokens to margin to do swaps with
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('100')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = true
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)
          // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
          await expect(callee.swapXForY(poolId, amount.raw), 'Engine:Swap').to.emit(engine, EngineEvents.SWAP)

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
          expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
        })

        it('Engine::Swap: Swap Y to X from EOA', async function () {
          await callee.deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('0.2')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = false
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)

          // TODO: Swap deltaIn amount is different from esimated deltaIn
          await expect(engine.swap(poolId, addXRemoveY, amount.raw, ethers.constants.MaxUint256), 'Engine:Swap').to.emit(
            engine,
            EngineEvents.SWAP
          )

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
          expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
        })

        it('Engine::Swap: Swap Y to X from Callee', async function () {
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('0.2')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = false
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(amount, addXRemoveY, invariant, params)

          // TODO: Swap deltaIn amount is different from esimated deltaIn
          await expect(callee.swapYForX(poolId, amount.raw), 'Engine:Swap').to.emit(engine, EngineEvents.SWAP)

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
          expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
        })
      })

      describe('fail cases', function () {})
    })
  })

  describe('Lending', function () {
    describe('#lend', function () {
      describe('success cases', function () {
        it('Engine::lend: Increase a positions float', async function () {})
      })
    })
    describe('#borrow', function () {
      describe('success cases', function () {
        it('Engine::borrow: Increase a positions loan debt', async function () {})
      })
    })
    describe('#repay', function () {
      describe('success cases', function () {
        it('Engine::repay: Decrease a positions loan debt', async function () {})
      })
    })
  })
})
