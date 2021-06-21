import { waffle } from 'hardhat'
import { expect } from 'chai'
import { EngineEvents, ERC20Events } from '../events'
import { BytesLike, constants, Wallet } from 'ethers'
import { Wei, parseWei, PERCENTAGE } from '../../../shared/Units'
import loadContext from '../../context'
import { getPoolParams, PoolParams, getDeltaIn } from '../../../shared/utilities'
import { swapFragment } from '../fragments'

const INITIAL_MARGIN = parseWei('1000')
const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('swap', function () {
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
      deployer = this.signers[0]
      poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
    })

    it('swaps risky for stable', async function () {
      let [riskyForStable, deltaOut, deltaInMax] = [true, parseWei('0.01').raw, constants.MaxUint256]
      await this.contracts.engineSwap.swap(poolId, riskyForStable, deltaOut, deltaInMax, false, empty)
    })

    describe('sucess cases', function () {
      it('Engine::Swap: Swap X to Y from EOA using Margin', async function () {
        // before: add tokens to margin to do swaps with
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw, deployer)
        const invariant = await this.contracts.engine.invariantOf(poolId) // store inariant current
        const amount = parseWei('100') // amount to swap
        const params: PoolParams = await getPoolParams(this.contracts.engine, poolId) // gets calibrationm
        const addXRemoveY: boolean = true // are we swapping risky tokens to stable tokens?
        const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
          amount,
          addXRemoveY,
          invariant.toString(),
          params
        )
        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(
          this.contracts.engine.swap(poolId, addXRemoveY, amount.raw, constants.MaxUint256, true, empty),
          'Engine:Swap'
        ).to.emit(this.contracts.engine, EngineEvents.SWAP)

        const postReserve = await this.contracts.engine.reserves(poolId)
        expect(Math.abs(postInvariant)).to.be.gte(Math.abs(new Wei(invariant).float))
        expect(postParams.reserve.reserveRisky.raw, 'check FXR1').to.be.eq(postReserve.reserveRisky) // FIX
        expect(postParams.reserve.reserveStable.raw, 'check FYR2').to.be.eq(postReserve.reserveStable) // FIX
      })

      it('Engine::Swap: Swap X to Y from Callee', async function () {
        // before: add tokens to margin to do swaps with
        const invariant = await this.contracts.engine.invariantOf(poolId)
        const amount = parseWei('100')
        const params: PoolParams = await getPoolParams(this.contracts.engine, poolId)
        const addXRemoveY: boolean = true
        const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
          amount,
          addXRemoveY,
          invariant.toString(),
          params
        )
        // TODO: There is low accuracy for the swap because the callDelta which initializes the pool is inaccurate
        await expect(this.functions.swapXForY(poolId, true, amount.raw, constants.MaxUint256, false), 'Engine:Swap').to.emit(
          this.contracts.engine,
          EngineEvents.SWAP
        )

        const postReserve = await this.contracts.engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        expect(postParams.reserve.reserveRisky.raw, 'check FXR1').to.be.eq(postReserve.reserveRisky) // FIX
        expect(postParams.reserve.reserveStable.raw, 'check FYR2').to.be.eq(postReserve.reserveStable) // FIX
      })

      it('Engine::Swap: Swap Y to X from EOA from margin', async function () {
        //await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
        const invariant = await this.contracts.engine.invariantOf(poolId)
        const amount = parseWei('0.2')
        const params: PoolParams = await getPoolParams(this.contracts.engine, poolId)
        const addXRemoveY: boolean = false
        const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
          amount,
          addXRemoveY,
          invariant.toString(),
          params
        )

        // TODO: Swap deltaIn amount is different from esimated deltaIn
        await expect(
          this.contracts.engine.swap(poolId, addXRemoveY, amount.raw, constants.MaxUint256, true, empty),
          'Engine:Swap'
        ).to.emit(this.contracts.engine, EngineEvents.SWAP)

        const postReserve = await this.contracts.engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        //expect(postParams.reserve.reserveRisky.raw.toString(), 'check FXR1').to.be.eq(postReserve.reserveRisky)
        //expect(postParams.reserve.reserveStable.raw.toString(), 'check FYR2').to.be.eq(postReserve.reserveStable)
      })

      it('Engine::Swap: Swap Y to X from Callee', async function () {
        const invariant = await this.contracts.engine.invariantOf(poolId)
        const amount = parseWei('0.2')
        const params: PoolParams = await getPoolParams(this.contracts.engine, poolId)
        const addXRemoveY: boolean = false
        const { deltaIn, deltaOut, postParams, postInvariant } = getDeltaIn(
          amount,
          addXRemoveY,
          invariant.toString(),
          params
        )

        // TODO: Swap deltaIn amount is different from esimated deltaIn
        await expect(
          this.functions.swapYForX(poolId, false, amount.raw, constants.MaxUint256, false),
          'Engine:Swap'
        ).to.emit(this.contracts.engine, EngineEvents.SWAP)

        const postReserve = await this.contracts.engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        //expect(postParams.reserve.reserveRisky.raw.toString(), 'check FXR1').to.be.eq(postReserve.reserveRisky)
        //expect(postParams.reserve.reserveStable.raw.toString(), 'check FYR2').to.be.eq(postReserve.reserveStable)
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
      it('Fail Callee::Swap: Not enough TX1', async function () {})
      it('Fail Callee::Swap: Not enough TY2', async function () {})
    })
  })
})
