import { waffle } from 'hardhat'
import { expect } from 'chai'
import { EngineEvents, ERC20Events } from '../events'
import { BytesLike, constants, Wallet } from 'ethers'
import { Wei, parseWei, PERCENTAGE } from '../../../shared/sdk/Units'
import loadContext from '../../context'
import { getPoolParams, PoolParams, getDeltaIn, getReserve } from '../../../shared/utilities'
import { swapFragment } from '../fragments'
import * as swapUtils from '../../../shared/swapUtils'

const INITIAL_MARGIN = parseWei('1000')
const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('Engine:swap', function () {
  before('Generate fixture loader', async function () {
    await loadContext(
      waffle.provider,
      ['engineCreate', 'engineSwap', 'engineDeposit', 'engineLend', 'engineAllocate'],
      swapFragment
    )
  })

  describe('--swap--', function () {
    let poolId: BytesLike
    let deployer: Wallet

    beforeEach(async function () {
      poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      deployer = this.signers[0]
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.contracts.engineAllocate.address,
        parseWei('1000').raw,
        empty
      )
    })

    it('swaps risky for stable', async function () {
      let [riskyForStable, deltaOut, deltaInMax] = [true, parseWei('0.01').raw, constants.MaxUint256]
      await this.contracts.engineSwap.swap(poolId, riskyForStable, deltaOut, deltaInMax, false, empty)
    })

    describe('sucess cases', function () {
      it('Engine::Swap: Swap X to Y from EOA using Margin', async function () {
        // before: add tokens to margin to do swaps with
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw, deployer)
        const deltaOut = parseWei('100') // deltaOut to swap
        const riskyForStable: boolean = true // are we swapping risky tokens to stable tokens?

        const invariantLast = await this.contracts.engine.invariantOf(poolId) // store inariant current
        const reserveLast = await getReserve(this.contracts.engine, poolId)
        const { deltaIn, reserveRisky, reserveStable, invariant } = await swapUtils.swap(
          this.contracts.engine,
          poolId,
          riskyForStable,
          deltaOut
        )

        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(
          this.contracts.engine.swap(poolId, riskyForStable, deltaOut.raw, constants.MaxUint256, true, empty),
          'Engine:Swap'
        )
          .to.emit(this.contracts.engine, EngineEvents.SWAP)
          .withArgs(deployer.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw, 'check FXR1').to.be.eq(reserveLast.reserveRisky) // FIX
        expect(reserveStable.raw, 'check FYR2').to.be.eq(reserveLast.reserveStable) // FIX
      })

      it('Engine::Swap: Swap X to Y from Callee', async function () {
        // before: add tokens to margin to do swaps with
        const deltaOut = parseWei('100')
        const riskyForStable: boolean = true
        const invariantLast = await this.contracts.engine.invariantOf(poolId)
        const reserveLast = await getReserve(this.contracts.engine, poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await swapUtils.swap(
          this.contracts.engine,
          poolId,
          riskyForStable,
          deltaOut
        )

        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(this.functions.swapXForY(poolId, true, deltaOut.raw, constants.MaxUint256, false), 'Engine:Swap')
          .to.emit(this.contracts.engine, EngineEvents.SWAP)
          .withArgs(this.contracts.engineSwap.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw, 'check FXR1').to.be.eq(reserveLast.reserveRisky) // FIX
        expect(reserveStable.raw, 'check FYR2').to.be.eq(reserveLast.reserveStable) // FIX
      })

      it('Engine::Swap: Swap Y to X from EOA from margin', async function () {
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
        const deltaOut = parseWei('0.2')
        const riskyForStable: boolean = false
        const invariantLast = await this.contracts.engine.invariantOf(poolId)
        const reserveLast = await getReserve(this.contracts.engine, poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await swapUtils.swap(
          this.contracts.engine,
          poolId,
          riskyForStable,
          deltaOut
        )

        // TODO: Swap deltaIn deltaOut is different from esimated deltaIn
        await expect(
          this.contracts.engine.swap(poolId, riskyForStable, deltaOut.raw, constants.MaxUint256, true, empty),
          'Engine:Swap'
        )
          .to.emit(this.contracts.engine, EngineEvents.SWAP)
          .withArgs(deployer.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw.toString(), 'check FXR1').to.be.eq(reserveLast.reserveRisky)
        expect(reserveStable.raw.toString(), 'check FYR2').to.be.eq(reserveLast.reserveStable)
      })

      it('Engine::Swap: Swap Y to X from Callee', async function () {
        const deltaOut = parseWei('0.2')
        const riskyForStable: boolean = false
        const invariantLast = await this.contracts.engine.invariantOf(poolId)
        const reserveLast = await getReserve(this.contracts.engine, poolId)

        const { deltaIn, reserveRisky, reserveStable, invariant } = await swapUtils.swap(
          this.contracts.engine,
          poolId,
          riskyForStable,
          deltaOut
        )

        // TODO: Swap deltaIn deltaOut is different from esimated deltaIn
        await expect(this.functions.swapYForX(poolId, false, deltaOut.raw, constants.MaxUint256, false), 'Engine:Swap')
          .to.emit(this.contracts.engine, EngineEvents.SWAP)
          .withArgs(this.contracts.engineSwap.address, poolId, riskyForStable, deltaIn.raw, deltaOut.raw)

        expect(Math.abs(invariant)).to.be.gte(Math.abs(new Wei(invariantLast).float))
        expect(reserveRisky.raw.toString(), 'check FXR1').to.be.eq(reserveLast.reserveRisky)
        expect(reserveStable.raw.toString(), 'check FYR2').to.be.eq(reserveLast.reserveStable)
      })
    })

    describe('fail cases', function () {
      it('Fail Callee::SwapXForY: No X balance', async function () {
        await expect(
          this.contracts.engineSwap
            .connect(this.signers[1])
            .swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256, false, empty)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::SwapYForX: No Y balance', async function () {
        // before: add initial margin
        await expect(
          this.contracts.engineSwap
            .connect(this.signers[1])
            .swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256, false, empty)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::Swap: Too expensive', async function () {
        await expect(this.contracts.engine.swap(poolId, true, 1, 0, false, empty)).to.be.revertedWith('Too expensive')
      })
      it('Fail Callee::Swap: Invalid invariant', async function () {})
      it('Fail Callee::Swap: Sent too much tokens', async function () {})
      it('Fail Callee::Swap: Not enough risky', async function () {})
      it('Fail Callee::Swap: Not enough stable', async function () {})
    })
  })
})
