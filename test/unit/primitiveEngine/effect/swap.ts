import hre, { waffle } from 'hardhat'
import { expect } from 'chai'
import { EngineEvents, ERC20Events } from '../events'
import { BytesLike, constants, Wallet } from 'ethers'
import { Wei, parseWei, PERCENTAGE } from '../../../shared/Units'
import loadContext from '../../context'
import * as ContractTypes from '../../../../typechain'
import { Contracts } from '../../../../types'
import { getPoolParams, PoolParams, getDeltaIn } from '../../../shared/utilities'

const INITIAL_MARGIN = parseWei('1000')
const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero
export async function createFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.factory.create(contracts.risky.address, contracts.stable.address)
  const engineAdd = await contracts.factory.getEngine(contracts.risky.address, contracts.stable.address)
  contracts.engine = (await hre.ethers.getContractAt('PrimitiveEngine', engineAdd)) as ContractTypes.PrimitiveEngine

  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
}

export async function swapFragment(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.stable.approve(contracts.engineSwap.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineSwap.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
}

describe('swap', function () {
  before('Generate fixture loader', async function () {
    await loadContext(waffle.provider, ['engineCreate', 'engineSwap', 'engineDeposit'], swapFragment)
  })

  describe('--swap--', function () {
    let poolId: BytesLike
    let deployer: Wallet

    beforeEach(async function () {
      deployer = this.signers[0]
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('0.01').raw, empty)
      poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
    })

    it('swaps risky for stable', async function () {
      let [pid, riskyForStable, deltaOut, deltaInMax] = [poolId, true, parseWei('0.01').raw, constants.MaxUint256]
      await this.contracts.engineSwap.swap(pid, riskyForStable, deltaOut, deltaInMax, false, empty)
    })

    describe('sucess cases', function () {
      it('Engine::Swap: Swap X to Y from EOA using Margin', async function () {
        // before: add tokens to margin to do swaps with
        await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw, deployer)
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
        expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
        expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
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
        expect(postParams.reserve.RX1.raw, 'check FXR1').to.be.eq(postReserve.RX1) // FIX
        expect(postParams.reserve.RY2.raw, 'check FYR2').to.be.eq(postReserve.RY2) // FIX
      })

      it('Engine::Swap: Swap Y to X from EOA from margin', async function () {
        await this.functions.depositFunction(INITIAL_MARGIN.raw, INITIAL_MARGIN.raw)
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
        expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
        expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
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
        expect(postParams.reserve.RX1.raw.toString(), 'check FXR1').to.be.eq(postReserve.RX1)
        expect(postParams.reserve.RY2.raw.toString(), 'check FYR2').to.be.eq(postReserve.RY2)
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
