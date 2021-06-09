import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BytesLike, constants, Wallet } from 'ethers'
import { parseWei, PERCENTAGE } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineSwapFixture, PrimitiveEngineSwapFixture } from '../fixtures/swapFixture'
import { PrimitiveEngine } from '../../../../typechain'

import { getPoolParams, PoolParams } from '../../../shared/Engine'
import setupContext from '../../context'

const INITIAL_MARGIN = parseWei('1000')
const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('swap', function () {
  let context: PrimitiveEngineSwapFixture, engine: PrimitiveEngine
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()
  let poolId: BytesLike

  before('Generate fixture loader', async function () {
    await setupContext(waffle.provider, primitiveEngineSwapFixture)
    console.log('setup context', this.contracts, this.signers)
  })

  describe('when the parameters are valid', function () {
    beforeEach(async function () {
      await this.contracts.create.create(strike, sigma, time, spot)
      poolId = await this.contracts.primitiveEngine.getPoolId(strike, sigma, time)
    })

    it('swaps risky for stable', async function () {
      let [pid, riskyForStable, deltaOut, deltaInMax] = [poolId, true, parseWei('0.01').raw, constants.MaxUint256]
      await this.contracts.swap.swap(pid, riskyForStable, deltaOut, deltaInMax, false)
    })
  })

  /* describe('--swap--', function () {
    describe('sucess cases', function () {
      it('Engine::Swap: Swap X to Y from EOA using Margin', async function () {
        // before: add tokens to margin to do swaps with
        await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
        const invariant = await engine.invariantOf(poolId)
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
        await expect(engine.swap(poolId, addXRemoveY, amount.raw, constants.MaxUint256, true), 'Engine:Swap').to.emit(
          engine,
          'Swap'
        )

        const postReserve = await engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
        expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
      })

      it('Engine::Swap: Swap X to Y from Callee', async function () {
        // before: add tokens to margin to do swaps with
        const invariant = await engine.invariantOf(poolId)
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

        const postReserve = await engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
        expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
      })

      it('Engine::Swap: Swap Y to X from EOA', async function () {
        await deposit(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
        const invariant = await engine.invariantOf(poolId)
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
        await expect(engine.swap(poolId, addXRemoveY, amount.raw, constants.MaxUint256, false), 'Engine:Swap').to.emit(
          engine,
          EngineEvents.SWAP
        )

        const postReserve = await engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
        expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
      })

      it('Engine::Swap: Swap Y to X from Callee', async function () {
        const invariant = await engine.invariantOf(poolId)
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

        const postReserve = await engine.reserves(poolId)
        //expect(postInvariant).to.be.gte(new Wei(invariant).float)
        expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
        expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
      })
    })

    describe('fail cases', function () {
      it('Fail Callee::SwapXForY: No X balance', async function () {
        await expect(
          callee.connect(signer2).swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::SwapYForX: No Y balance', async function () {
        // before: add initial margin
        await expect(
          callee.connect(signer2).swap(poolId, true, parseWei('0.1').raw, constants.MaxUint256)
        ).to.be.revertedWith(ERC20Events.EXCEEDS_BALANCE)
      })

      it('Fail Callee::Swap: Too expensive', async function () {
        await expect(engine.swap(poolId, true, 1, 0, false)).to.be.revertedWith('Too expensive')
      })
      it('Fail Callee::Swap: Invalid invariant', async function () {})
      it('Fail Callee::Swap: Sent too much tokens', async function () {})
      it('Fail Callee::Swap: Not enough TX1', async function () {})
      it('Fail Callee::Swap: Not enough TY2', async function () {})
    })
  }) */
})
