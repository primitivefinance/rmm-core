import hre, { ethers, waffle } from 'hardhat'
import { Wallet, constants } from 'ethers'
import { PERCENTAGE, parseWei, BigNumber, Wei } from './shared/Units'
import { primitiveProtocolFixture } from './shared/fixtures'
import { expect } from 'chai'
import { IERC20, PrimitiveHouse, TestCallee, PrimitiveEngine, TestBlackScholes } from '../typechain'
import {
  EngineEvents,
  ERC20Events,
  createEngineFunctions,
  SwapFunction,
  DepositFunction,
  WithdrawFunction,
  AddLiquidityFunction,
  CreateFunction,
  LendFunction,
  ClaimFunction,
  BorrowFunction,
  RepayFunction,
} from './shared/Engine'

import {
  Calibration,
  Reserve,
  PoolParams,
  getReserve,
  getPoolParams,
  addBoth,
  getMargin,
  getDeltaIn,
  removeBoth,
  getPosition,
} from './shared/utilities'

const { createFixtureLoader } = waffle

describe('Primitive Engine', function () {
  // Contracts
  let engine: PrimitiveEngine, callee: TestCallee, house: PrimitiveHouse, TX1: IERC20, TY2: IERC20, bs: TestBlackScholes
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
    create: CreateFunction,
    lend: LendFunction,
    claim: ClaimFunction,
    borrow: BorrowFunction,
    repay: RepayFunction

  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  let loadFixture: ReturnType<typeof createFixtureLoader>

  const INITIAL_MARGIN = parseWei('1000')

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    // get contracts
    ;({ engine, callee, house, TX1, TY2, bs } = await loadFixture(primitiveProtocolFixture))
    // init external settings
    nonce = 0
    spot = parseWei('1000')
    // Calibration struct
    const [strike, sigma, time] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600]
    calibration = { strike, sigma, time }
    // Engine functions
    ;({ deposit, withdraw, addLiquidity, swapXForY, swapYForX, create, lend, claim, borrow, repay } = createEngineFunctions({
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

    describe('fail cases', function () {
      it('Fail Engine::Create: Already created', async function () {
        await expect(engine.create(calibration, spot.raw)).to.be.revertedWith('Already created')
      })
      it('Fail Engine::Create: time is 0', async function () {
        const cal = { strike: parseWei('500').raw, sigma: calibration.sigma, time: 0 }
        await expect(create(cal, spot.raw)).to.be.reverted
      })
      it('Fail Engine::Create: sigma is 0', async function () {
        const cal = { strike: parseWei('500').raw, sigma: 0, time: calibration.time }
        await expect(create(cal, spot.raw)).to.be.reverted
      })
      it('Fail Engine::Create: strike is 0', async function () {
        const cal = { strike: parseWei('0').raw, sigma: calibration.sigma, time: calibration.time }
        await expect(create(cal, spot.raw)).to.be.reverted
      })
      it('Fail Engine::Create: Not enough risky tokens', async function () {
        const cal = { strike: parseWei('1500').raw, sigma: calibration.sigma, time: calibration.time }
        await expect(engine.create(cal, spot.raw)).to.be.revertedWith('Not enough risky tokens')
      })
      it('Fail Engine::Create: Not enough riskless tokens', async function () {
        const cal = { strike: parseWei('750').raw, sigma: calibration.sigma, time: calibration.time }
        await TX1.mint(engine.address, parseWei('100').raw)
        await expect(engine.create(cal, spot.raw)).to.be.revertedWith('Not enough riskless tokens')
      })
    })
  })

  describe('Margin', function () {
    this.beforeEach(async function () {})

    const checkMargin = async (deltaX, deltaY) => {
      const { owner, BX1, BY2, unlocked } = await getMargin(engine, signer.address)
      expect(owner).to.be.eq(signer.address)
      expect(BX1.raw).to.be.eq(deltaX)
      expect(BY2.raw).to.be.eq(deltaY)
      expect(unlocked).to.be.eq(false)
    }

    describe('#deposit', function () {
      describe('sucess cases', function () {
        it('Callee::Deposit: Adds X', async function () {
          const amount = parseWei('200').raw
          // deposit 200
          await expect(deposit(amount, 0))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(callee.address, signer.address, amount, 0)
          await checkMargin(amount, 0)
        })

        it('Callee::Deposit: Adds Y', async function () {
          const amount = parseWei('200').raw
          // deposit 200
          await expect(deposit(0, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(callee.address, signer.address, 0, amount)
          await checkMargin(0, amount)
        })

        it('Callee::Deposit: Adds X and Y ', async function () {
          const amount = parseWei('200').raw
          // deposit 200
          await expect(deposit(amount, amount))
            .to.emit(engine, EngineEvents.DEPOSITED)
            .withArgs(callee.address, signer.address, amount, amount)
          await checkMargin(amount, amount)
        })
      })

      describe('fail cases', function () {
        it('Fail Engine::Deposit: Called from EOA', async function () {
          await expect(engine.deposit(signer.address, 1, 1)).to.be.reverted
        })
        it('Fail Engine::Deposit: Not enough TX1', async function () {
          await expect(callee.depositFailTX1(1, 0)).to.be.revertedWith('Not enough TX1')
        })
        it('Fail Engine::Deposit: Not enough TY2', async function () {
          await expect(callee.depositFailTY2(0, 1)).to.be.revertedWith('Not enough TY2')
        })
      })
    })

    describe('#withdraw', function () {
      this.beforeEach(async function () {
        await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
      })
      describe('sucess cases', function () {
        it('Engine::Withdraw: Removes X', async function () {
          // before: deposit 100
          const amount = INITIAL_MARGIN.raw
          // remove 100
          await expect(withdraw(amount, 0))
            .to.emit(engine, EngineEvents.WITHDRAWN)
            .withArgs(signer.address, signer.address, amount, 0)
          // deposit 100
          await deposit(amount, 0)
          // remove 100
          await expect(() => withdraw(amount, 0)).to.changeTokenBalance(TX1, signer, amount)
          await checkMargin(0, amount)
        })
        it('Engine::Withdraw: Removes Y', async function () {
          // before: deposit 100
          const amount = INITIAL_MARGIN.raw
          // remove 100
          await expect(withdraw(0, amount))
            .to.emit(engine, EngineEvents.WITHDRAWN)
            .withArgs(signer.address, signer.address, 0, amount)
          // deposit 100
          await deposit(0, amount)
          // remove 100
          await expect(() => withdraw(0, amount)).to.changeTokenBalance(TY2, signer, amount)
          await checkMargin(amount, 0)
        })
        it('Engine::Withdraw: Removes X and Y', async function () {
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
          await checkMargin(0, 0)
        })
      })

      describe('fail cases', function () {
        it('Fail Engine::Withdraw: Not enough TX1', async function () {}) // can we even enter these fails?
        it('Fail Engine::Withdraw: Not enough TY2', async function () {}) // can we even enter these fails?
        it('Fail Engine::Withdraw: Not enough BX1 in Margin', async function () {
          await expect(withdraw(parseWei('10000').raw, 0)).to.be.reverted
        })
        it('Fail Engine::Withdraw: Not enough BY2 in Margin', async function () {
          await expect(withdraw(0, parseWei('10000').raw)).to.be.reverted
        })
      })
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

      describe('fail cases', function () {
        it('Fail Engine::AddBoth: Not initialized', async function () {
          const getPid = (calibration) => {
            const cals = Object.keys(calibration).map((key) => calibration[key])
            return ethers.utils.solidityKeccak256(['uint256', 'uint256', 'uint256'], cals)
          }

          const cal = { strike: parseWei('666').raw, sigma: 0, time: calibration.time }
          const pid = getPid(cal)
          await expect(addLiquidity(pid, 0, 1)).to.be.revertedWith('Not initialized')
        })
        it('Fail Engine::AddBoth: Deltas are 0', async function () {
          await expect(addLiquidity(poolId, nonce, 0)).to.be.revertedWith('Deltas are 0')
        })
        it('Fail Engine::AddBoth: Invalid Invariant', async function () {})
        it('Fail Engine::AddBoth: Not enough TX1', async function () {
          await expect(callee.addLiquidityFailTX1(poolId, nonce, 1)).to.be.reverted
        })
        it('Fail Engine::AddBoth: Not enough TY2', async function () {
          await expect(callee.addLiquidityFailTY2(poolId, nonce, 1)).to.be.reverted
        })
        it('Fail Engine::AddBoth: Not enough BX1 in Margin', async function () {
          await expect(engine.addBoth(poolId, signer.address, nonce, 1, true)).to.be.reverted
        })
        it('Fail Engine::AddBoth: Not enough BY2 in Margin', async function () {
          await deposit(10, 0)
          await expect(engine.addBoth(poolId, signer.address, nonce, 1, true)).to.be.reverted
        })
      })
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
        it('Fail Engine::RemoveBoth: Not initialized', async function () {
          const getPid = (calibration) => {
            const cals = Object.keys(calibration).map((key) => calibration[key])
            return ethers.utils.solidityKeccak256(['uint256', 'uint256', 'uint256'], cals)
          }

          const cal = { strike: parseWei('444').raw, sigma: 0, time: calibration.time }
          const pid = getPid(cal)
          await expect(engine.removeBoth(pid, 0, 1, true)).to.be.revertedWith('Not initialized')
        })
        it('Fail Engine::RemoveBoth: Deltas are 0', async function () {
          await expect(engine.removeBoth(poolId, 0, 0, true)).to.be.revertedWith('Deltas are 0')
        })
        it('Fail Engine::RemoveBoth: Invalid Invariant', async function () {})
        it('Fail Engine::RemoveBoth: Above max burn', async function () {
          const L = (await engine.getReserve(poolId)).liquidity
          await expect(engine.removeBoth(poolId, 0, L.add(1), true)).to.be.revertedWith('Above max burn')
        })
        it('Fail Engine::RemoveBoth: Not enough TX1', async function () {})
        it('Fail Engine::RemoveBoth: Not enough TY2', async function () {})
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

        it('Fail Callee::Swap: Too expensive', async function () {
          await expect(engine.swap(poolId, true, 1, 0)).to.be.revertedWith('Too expensive')
        })
        it('Fail Callee::Swap: Invalid invariant', async function () {})
        it('Fail Callee::Swap: Sent too much tokens', async function () {})
        it('Fail Callee::Swap: Not enough TX1', async function () {})
        it('Fail Callee::Swap: Not enough TY2', async function () {})
      })
    })
  })

  describe('Lending', function () {
    this.beforeEach(async function () {
      await addLiquidity(poolId, nonce, 1000)
    })
    const checkPosition = async (deltaL) => {
      const pos = await getPosition(engine, signer.address, nonce, poolId)
      expect(pos.float.raw).to.be.eq(deltaL)
    }

    describe('#lend', function () {
      describe('success cases', function () {
        it('Engine::lend: Increase a positions float', async function () {
          await expect(lend(poolId, nonce, 1000))
            .to.emit(engine, EngineEvents.LOANED)
            .withArgs(signer.address, poolId, nonce, 1000)
          const pos = await getPosition(engine, signer.address, nonce, poolId)
          expect(pos.float.raw).to.be.eq(1000)
        })
      })

      describe('fail cases', function () {
        it('Fail Engine::lend: Not enough liquidity', async function () {
          await expect(engine.lend(poolId, nonce, 1001)).to.be.revertedWith('Not enough liquidity')
        })
      })
    })
    describe('#borrow', function () {
      this.beforeEach(async function () {
        await lend(poolId, nonce, 1000)
      })
      describe('success cases', function () {
        it('Engine::borrow: Increase a positions loan debt', async function () {
          await expect(borrow(poolId, signer.address, nonce, 1000, constants.MaxUint256)).to.not.be.reverted.to.emit(
            engine,
            EngineEvents.BORROWED
          )
        })
      })
    })
    describe('#repay', function () {
      this.beforeEach(async function () {
        await lend(poolId, nonce, 1000)
        await borrow(poolId, signer.address, nonce, 1000, constants.MaxUint256)
      })
      describe('success cases', function () {
        it('Engine::repay: Decrease a positions loan debt', async function () {
          await expect(repay(poolId, signer.address, nonce, 1000)).to.not.be.reverted.to.emit(engine, EngineEvents.REPAID)
        })
      })
    })
  })
})
