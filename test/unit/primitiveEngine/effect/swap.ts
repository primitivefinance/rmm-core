// Standard Imports
import { expect } from 'chai'
import { waffle } from 'hardhat'
import { BytesLike, constants, Wallet } from 'ethers'
import { PrimitiveEngine, EngineAllocate, EngineSwap } from '../../../../typechain'
// Context Imports
import loadContext, { config } from '../../context'
import { swapFragment } from '../fragments'
// SDK Imports
import {
  Wei,
  Percentage,
  Time,
  parseWei,
  Integer64x64,
  getEngineEntityFromAddress,
  Engine,
  EngineEvents,
  ERC20Events,
  Pool,
} from '../../../shared/sdk'

// Constants
const { strike, sigma, maturity, lastTimestamp, spot } = config
const empty: BytesLike = constants.HashZero

describe('Engine:swap', function () {
  before('Load context', async function () {
    await loadContext(
      waffle.provider,
      ['engineCreate', 'engineSwap', 'engineDeposit', 'engineLend', 'engineAllocate'],
      swapFragment
    )
  })

  describe('--swap--', function () {
    let poolId: BytesLike
    let deployer: Wallet
    let engine: PrimitiveEngine, engineAllocate: EngineAllocate, engineSwap: EngineSwap
    let entity: Engine

    beforeEach(async function () {
      ;[deployer, engine, engineAllocate, engineSwap] = [
        this.signers[0],
        this.contracts.engine,
        this.contracts.engineAllocate,
        this.contracts.engineSwap,
      ]
      poolId = await engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
      entity = await getEngineEntityFromAddress(engine.address, [poolId], [], [deployer.address], deployer.provider)
      await engineAllocate.allocateFromExternal(poolId, engineAllocate.address, parseWei('1000').raw, empty)
    })

    it('Engine::Swap: Swap Risky To Stable', async function () {
      let [riskyForStable, deltaOut, deltaInMax] = [true, parseWei('0.01').raw, constants.MaxUint256]
      await engineSwap.swap(poolId, riskyForStable, deltaOut, deltaInMax, false, empty)
    })

    describe('sucess cases', function () {
      it.only('Engine::Swap: Swap Risky to Stable from EOA using Margin', async function () {
        // before: add tokens to margin to do swaps with
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw, deployer)
        const deltaOut = parseWei('1') // deltaOut to swap
        const riskyForStable = true // are we swapping risky tokens to stable tokens?

        const invariantLast = new Integer64x64(await engine.invariantOf(poolId)) // store inariant current
        const reserveLast = await engine.reserves(poolId)
        const { deltaIn, reserveRisky, reserveStable, invariant } = await entity.swap(poolId, riskyForStable, deltaOut)
        const pool: Pool = entity.getPool(poolId)
        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(engine.swap(poolId, riskyForStable, deltaOut.raw, constants.MaxUint256, true, empty), 'Engine:Swap')
          .to.emit(engine, EngineEvents.SWAP)
          .withArgs(deployer.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(new Wei(invariant.raw).float)).to.be.gte(Math.abs(new Wei(invariantLast.raw).float))
        expect(pool.reserveRisky.raw, 'check FXR1').to.be.eq(reserveLast.reserveRisky) // FIX
        expect(pool.reserveStable.raw, 'check FYR2').to.be.eq(reserveLast.reserveStable) // FIX
      })

      it('Engine::Swap: Swap X to Y from Callee', async function () {
        // before: add tokens to margin to do swaps with
        const deltaOut = parseWei('100')
        const riskyForStable: boolean = true
        const invariantLast = await engine.invariantOf(poolId)
        const reserveLast = await engine.reserves(poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await entity.swap(poolId, riskyForStable, deltaOut)

        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(this.functions.swapXForY(poolId, true, deltaOut.raw, constants.MaxUint256, false), 'Engine:Swap')
          .to.emit(engine, EngineEvents.SWAP)
          .withArgs(engineSwap.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant.float)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw, 'check FXR1').to.be.eq(reserveLast.reserveRisky) // FIX
        expect(reserveStable.raw, 'check FYR2').to.be.eq(reserveLast.reserveStable) // FIX
      })

      it('Engine::Swap: Swap Y to X from EOA from margin', async function () {
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
        const deltaOut = parseWei('0.2')
        const riskyForStable: boolean = false
        const invariantLast = await engine.invariantOf(poolId)
        const reserveLast = await engine.reserves(poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await entity.swap(poolId, riskyForStable, deltaOut)

        // TODO: Swap deltaIn deltaOut is different from esimated deltaIn
        await expect(engine.swap(poolId, riskyForStable, deltaOut.raw, constants.MaxUint256, true, empty), 'Engine:Swap')
          .to.emit(engine, EngineEvents.SWAP)
          .withArgs(deployer.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant.float)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw.toString(), 'check FXR1').to.be.eq(reserveLast.reserveRisky)
        expect(reserveStable.raw.toString(), 'check FYR2').to.be.eq(reserveLast.reserveStable)
      })

      it('Engine::Swap: Swap Y to X from Callee', async function () {
        const deltaOut = parseWei('0.2')
        const riskyForStable: boolean = false
        const invariantLast = await engine.invariantOf(poolId)
        const reserveLast = await engine.reserves(poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await entity.swap(poolId, riskyForStable, deltaOut)

        // TODO: Swap deltaIn deltaOut is different from esimated deltaIn
        await expect(this.functions.swapYForX(poolId, false, deltaOut.raw, constants.MaxUint256, false), 'Engine:Swap')
          .to.emit(engine, EngineEvents.SWAP)
          .withArgs(engineSwap.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant.float)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw.toString(), 'check FXR1').to.be.eq(reserveLast.reserveRisky)
        expect(reserveStable.raw.toString(), 'check FYR2').to.be.eq(reserveLast.reserveStable)
      })
    })

    describe('fail cases', function () {
      it('Fail Callee::SwapXForY: No X balance', async function () {
        await expect(
          engineSwap.connect(this.signers[1]).swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256, false, empty)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::SwapYForX: No Y balance', async function () {
        // before: add initial margin
        await expect(
          engineSwap.connect(this.signers[1]).swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256, false, empty)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::Swap: Expensive', async function () {
        await expect(engine.swap(poolId, true, 1, 0, false, empty)).to.be.revertedWith('Expensive')
      })
      it('Fail Callee::Swap: Invalid invariant', async function () {})
      it('Fail Callee::Swap: Sent too much tokens', async function () {})
      it('Fail Callee::Swap: Not enough risky', async function () {})
      it('Fail Callee::Swap: Not enough stable', async function () {})
    })
  })
})
