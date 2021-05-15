import hre, { ethers, waffle } from 'hardhat'
import { Wallet, constants } from 'ethers'
import { PERCENTAGE, parseWei, BigNumber, Wei } from './shared/Units'
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
  SwapFunction,
  DepositFunction,
  WithdrawFunction,
  AddLiquidityFunction,
  CreateFunction,
} from './shared/Engine'
import { primitiveProtocolFixture } from './shared/fixtures'
import { expect } from 'chai'
import { IERC20, PrimitiveHouse, TestCallee, TestEngine } from '../typechain'
const { createFixtureLoader } = waffle

describe('Primitive Engine', function () {
  // Contracts
  let engine: TestEngine, callee: TestCallee, house: PrimitiveHouse, TX1: IERC20, TY2: IERC20
  // Pool settings
  let poolId: string, calibration: Calibration, reserve: Reserve
  // External settings
  let nonce: number, spot: Wei
  // Invariant checks
  let preInvariant: BigNumber, postInvariant: BigNumber
  // Engine Functions
  let deposit: DepositFunction,
    withdraw: WithdrawFunction,
    swapXForY: SwapFunction,
    swapYForX: SwapFunction,
    addLiquidity: AddLiquidityFunction,
    create: CreateFunction

  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  let loadFixture: ReturnType<typeof createFixtureLoader>

  const INITIAL_MARGIN = parseWei('1000')

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    // get contracts
    ;({ engine, callee, house, TX1, TY2 } = await loadFixture(primitiveProtocolFixture))
    // init external settings
    nonce = 0
    spot = parseWei('1000')
    // Calibration struct
    const [strike, sigma, time] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600]
    calibration = { strike, sigma, time }
    // Engine functions
    ;({ deposit, withdraw, addLiquidity, swapXForY, swapYForX, create } = createEngineFunctions({
      target: callee,
      TX1,
      TY2,
      engine,
    }))
    // Create pool
    await create(calibration, spot.raw)
    poolId = await engine.getPoolId(calibration)
    reserve = await getReserve(engine, poolId)
    preInvariant = await engine.getInvariantLast(poolId)

    // name tags
    hre.tracer.nameTags[signer.address] = 'Signer'
    hre.tracer.nameTags[callee.address] = 'Callee'
    hre.tracer.nameTags[engine.address] = 'Engine'
    hre.tracer.nameTags[TX1.address] = 'Risky Token'
    hre.tracer.nameTags[TY2.address] = 'Riskless Token'
  })

  afterEach(async function () {
    postInvariant = await engine.getInvariantLast(poolId)
    expect(Math.abs(parseFloat(postInvariant.toString()))).to.be.gte(Math.abs(parseFloat(preInvariant.toString())))

    let riskyBal: Wei = parseWei('0')
    for (let i = 0; i < (await engine.getAllPoolsLength()).toNumber(); i++) {
      riskyBal = riskyBal.add((await engine.getReserve(poolId)).RX1)
    }

    riskyBal = riskyBal.add((await engine.getMargin(signer.address)).BX1)

    expect(await TX1.balanceOf(engine.address)).to.be.gte(riskyBal.raw)
  })

  describe('#create', function () {
    describe('sucess cases', function () {
      it('Engine::Create: Generates a new Curve', async function () {
        await expect(create(calibration, spot.raw)).to.not.be.reverted
      })
    })

    describe('fail cases', function () {
      it('Fail Engine::Create: time is 0', async function () {
        expect(
          create(
            {
              strike: parseWei('1').raw,
              sigma: 1,
              time: 0,
            },
            spot.raw
          )
        ).to.be.revertedWith('time is 0')
      })
      it('Fail Engine::Create: sigma is 0', async function () {
        expect(
          create(
            {
              strike: parseWei('1').raw,
              sigma: 0,
              time: 1,
            },
            spot.raw
          )
        ).to.be.revertedWith('time is 0')
      })
      it('Fail Engine::Create: strike is 0', async function () {
        expect(
          create(
            {
              strike: parseWei('0').raw,
              sigma: 1,
              time: 1,
            },
            spot.raw
          )
        ).to.be.revertedWith('time is 0')
      })
      it('Fail Engine::Create: Not enough risky tokens', async function () {
        await expect(engine.create(calibration, spot.raw)).to.be.revertedWith('Not enough risky tokens')
      })
      it('Fail Engine::Create: Not enough riskless tokens', async function () {
        await TX1.mint(engine.address, parseWei('100').raw)
        await expect(engine.create(calibration, spot.raw)).to.be.revertedWith('Not enough riskless tokens')
      })
    })
  })

  describe('Margin', function () {
    this.beforeEach(async function () {})

    describe('#deposit', function () {
      describe('sucess cases', function () {
        it('Callee::Deposit: Adds X and Y directly', async function () {
          const amount = parseWei('200').raw
          // deposit 200
          await expect(deposit(amount, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(callee.address, signer.address, amount, amount)
          const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
          expect(owner).to.be.eq(signer.address)
          expect(BX1.raw).to.be.eq(amount)
          expect(BY2.raw).to.be.eq(amount)
          expect(unlocked).to.be.eq(false)
        })
      })

      describe('fail cases', function () {})
    })

    describe('#withdraw', function () {
      this.beforeEach(async function () {
        await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
      })
      describe('sucess cases', function () {
        it('Engine::Withdraw: Removes X and Y directly', async function () {
          // before: deposit 100
          const amount = INITIAL_MARGIN.raw
          // remove 100
          await expect(withdraw(amount, amount))
            .to.emit(engine, EngineEvents.WITHDRAWN)
            .withArgs(signer.address, signer.address, amount, amount)
          // deposit 100
          await deposit(amount, amount)
          // remove 100
          await expect(() => withdraw(amount, amount)).to.changeTokenBalance(TX1, signer, amount)
          const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
          expect(owner).to.be.eq(signer.address)
          expect(BX1.raw).to.be.eq(0)
          expect(BY2.raw).to.be.eq(0)
          expect(unlocked).to.be.eq(false)
        })
      })

      describe('fail cases', function () {})
    })
  })

  describe('Liquidity', function () {
    this.beforeEach(async function () {})

    describe('#addBoth', function () {
      describe('sucess cases', function () {
        it('Engine::AddBoth: Add both X and Y from Balance', async function () {
          const invariant = await engine.getInvariantLast(poolId)
          const deltaL = parseWei('1')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
          await expect(addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
          expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(params.reserve.RX1.add(deltaX).raw).to.be.eq(postParams.reserve.RX1.raw)
          expect(params.reserve.RY2.add(deltaY).raw).to.be.eq(postParams.reserve.RY2.raw)
          expect(params.reserve.liquidity.add(deltaL).raw).to.be.eq(postParams.reserve.liquidity.raw)
        })

        it('Engine::AddBoth: Add both X and Y from Margin', async function () {
          await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const deltaL = parseWei('1')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const [deltaX, deltaY, postParams, postInvariant] = addBoth(deltaL, params)
          await expect(addLiquidity(poolId, nonce, deltaL.raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
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
        await expect(addLiquidity(poolId, nonce, parseWei('1').raw)).to.emit(engine, EngineEvents.ADDED_BOTH)
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
          expect(postInvariant).to.be.gte(parseFloat(invariant.toString()))
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
    this.beforeEach(async function () {})
    describe('#swap', function () {
      describe('sucess cases', function () {
        it('Engine::Swap: Swap X to Y from EOA', async function () {
          // before: add tokens to margin to do swaps with
          await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('100')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = true
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
            amount,
            addXRemoveY,
            invariant.toString(),
            params
          )
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
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
            amount,
            addXRemoveY,
            invariant.toString(),
            params
          )
          // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
          await expect(swapXForY(poolId, amount.raw, constants.MaxUint256), 'Engine:Swap').to.emit(engine, EngineEvents.SWAP)

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
          expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
        })

        it('Engine::Swap: Swap Y to X from EOA', async function () {
          await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
          const invariant = await engine.getInvariantLast(poolId)
          const amount = parseWei('0.2')
          const params: PoolParams = await getPoolParams(engine, poolId)
          const addXRemoveY: boolean = false
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
            amount,
            addXRemoveY,
            invariant.toString(),
            params
          )

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
          const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
            amount,
            addXRemoveY,
            invariant.toString(),
            params
          )

          // TODO: Swap deltaIn amount is different from esimated deltaIn
          await expect(swapYForX(poolId, amount.raw, constants.MaxUint256), 'Engine:Swap').to.emit(engine, EngineEvents.SWAP)

          const postReserve = await engine.getReserve(poolId)
          //expect(postInvariant).to.be.gte(new Wei(invariant).float)
          expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
          expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
        })
      })

      describe('fail cases', function () {
        it('Fail Callee::SwapXForY: No X balance', async function () {
          await expect(
            callee.connect(signer2).swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)
          ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
        })

        it('Fail Callee::SwapYForX: No Y balance', async function () {
          // before: add initial margin
          await expect(
            callee.connect(signer2).swap(poolId, true, parseWei('0.1').raw, ethers.constants.MaxUint256)
          ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
        })
      })
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
