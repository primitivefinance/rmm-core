import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei, Time } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { Contracts } from '../../../../types'
import { primitiveFixture, PrimitiveFixture } from '../../../shared/fixtures'
import { batchApproval } from '../../../shared'
const { createFixtureLoader } = waffle

const { strike, sigma, maturity, lastTimestamp, delta } = config
const { HashZero } = constants

export async function beforeEachAllocate(signers: Wallet[], contracts: Contracts): Promise<void> {
  const contractAddresses = Object.keys(contracts).map((key) => contracts[key]?.address)

  await batchApproval(contractAddresses, [contracts.risky, contracts.stable], signers[0])
  await contracts.stable.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineDeposit.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
  await contracts.risky.approve(contracts.engineAllocate.address, constants.MaxUint256)
  await contracts.stable.approve(contracts.engineAllocate.address, constants.MaxUint256)

  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  await contracts.engineAllocate.allocateFromExternal(poolId, signers[0].address, parseWei('100').raw, HashZero)
}

describe('allocate', function () {
  const signers: Wallet[] = waffle.provider.getWallets()
  const loadFixture = createFixtureLoader(signers, waffle.provider)

  let poolId: string, posId: string, fixture: PrimitiveFixture, contracts: Contracts
  beforeEach(async function () {
    fixture = await loadFixture(primitiveFixture)
    ;({ contracts } = fixture)

    poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    posId = await contracts.engineAllocate.getPosition(poolId)
    await beforeEachAllocate(signers, contracts)
  })

  describe('when allocating from margin', function () {
    beforeEach(async function () {
      await contracts.engineDeposit.deposit(
        contracts.engineAllocate.address,
        parseWei('1000').raw,
        parseWei('1000').raw,
        HashZero
      )
    })

    describe('success cases', function () {
      it('increases position liquidity', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.increasePositionLiquidity(contracts.engine, posId, parseWei('1').raw)
      })

      it('increases position liquidity of another recipient', async function () {
        const recipientPosId = computePositionId(signers[1].address, poolId)
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, signers[1].address, parseWei('1').raw, HashZero)
        ).to.increasePositionLiquidity(contracts.engine, recipientPosId, parseWei('1').raw)
      })

      it('emits the Allocated event', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.emit(contracts.engine, 'Allocated')
      })

      it('increases reserve liquidity', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.increaseReserveLiquidity(contracts.engine, poolId, parseWei('1').raw)
      })

      it('increases reserve risky', async function () {
        const res = await contracts.engine.reserves(poolId)
        const delRisky = parseWei('1').mul(res.reserveRisky).div(res.liquidity)
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.increaseReserveRisky(contracts.engine, poolId, delRisky.raw)
      })

      it('increases reserve stable', async function () {
        const res = await contracts.engine.reserves(poolId)
        const delStable = parseWei('1').mul(res.reserveStable).div(res.liquidity)
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.increaseReserveStable(contracts.engine, poolId, delStable.raw)
      })

      it('updates reserve timestamp', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(poolId, contracts.engineAllocate.address, parseWei('1').raw, HashZero)
        ).to.updateReserveBlockTimestamp(contracts.engine, poolId, +(await contracts.engine.time()))
      })
    })

    describe('fail cases', function () {
      it('reverts if reserve.blockTimestamp is 0 (poolId not initialized)', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(
            HashZero,
            contracts.engineAllocate.address,
            parseWei('10000000').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts if risky or stable margins are insufficient', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(
            poolId,
            contracts.engineAllocate.address,
            parseWei('10000000').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts if there is no liquidity', async function () {
        await expect(
          contracts.engineAllocate.allocateFromMargin(HashZero, signers[0].address, parseWei('1').raw, HashZero)
        ).to.be.revertedWith('UninitializedError()')
      })

      it('reverts if the deltas are 0', async function () {
        await expect(contracts.engineAllocate.allocateFromMargin(poolId, signers[0].address, '0', HashZero)).to.reverted
      })

      it('reverts if pool is expired', async function () {
        await contracts.engine.advanceTime(Time.YearInSeconds + 1)
        await expect(contracts.engineAllocate.allocateFromMargin(poolId, signers[0].address, '0', HashZero)).to.revertedWith(
          'PoolExpiredError()'
        )
      })
    })
  })

  describe('when allocating from external', function () {
    describe('success cases', function () {
      it('increases liquidity', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.increasePositionLiquidity(contracts.engine, posId, parseWei('1').raw)
      })

      it('increases position liquidity of another recipient', async function () {
        const recipientPosId = computePositionId(signers[1].address, poolId)
        await expect(
          contracts.engineAllocate.allocateFromExternal(poolId, signers[1].address, parseWei('1').raw, HashZero)
        ).to.increasePositionLiquidity(contracts.engine, recipientPosId, parseWei('1').raw)
      })

      it('emits the Allocated event', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.emit(contracts.engine, 'Allocated')
      })

      it('increases reserve liquidity', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.increaseReserveLiquidity(contracts.engine, poolId, parseWei('1').raw)
      })

      it('increases reserve risky', async function () {
        const res = await contracts.engine.reserves(poolId)
        const delRisky = parseWei('1').mul(res.reserveRisky).div(res.liquidity)
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.increaseReserveRisky(contracts.engine, poolId, delRisky.raw)
      })

      it('increases reserve stable', async function () {
        const res = await contracts.engine.reserves(poolId)
        const delStable = parseWei('1').mul(res.reserveStable).div(res.liquidity)
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.increaseReserveStable(contracts.engine, poolId, delStable.raw)
      })

      it('updates reserve timestamp', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternal(
            poolId,
            contracts.engineAllocate.address,
            parseWei('1').raw,
            HashZero
          )
        ).to.updateReserveBlockTimestamp(contracts.engine, poolId, +(await contracts.engine.time()))
      })

      it('transfers the tokens', async function () {
        const reserve = await contracts.engine.reserves(poolId)

        const deltaX = parseWei('1').mul(reserve.reserveRisky).div(reserve.liquidity)
        const deltaY = parseWei('1').mul(reserve.reserveStable).div(reserve.liquidity)

        const riskyBalance = await contracts.risky.balanceOf(signers[0].address)
        const stableBalance = await contracts.stable.balanceOf(signers[0].address)

        await contracts.engineAllocate.allocateFromExternal(
          poolId,
          contracts.engineAllocate.address,
          parseWei('1').raw,
          HashZero
        )

        expect(await contracts.risky.balanceOf(signers[0].address)).to.equal(riskyBalance.sub(deltaX.raw))
        expect(await contracts.stable.balanceOf(signers[0].address)).to.equal(stableBalance.sub(deltaY.raw))
      })
    })

    describe('fail cases', function () {
      it('reverts if risky are insufficient', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternalNoRisky(
            poolId,
            contracts.engineAllocate.address,
            parseWei('10').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts if stable are insufficient', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternalNoStable(
            poolId,
            contracts.engineAllocate.address,
            parseWei('10000').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts on reentrancy', async function () {
        await expect(
          contracts.engineAllocate.allocateFromExternalReentrancy(
            poolId,
            contracts.engineAllocate.address,
            parseWei('10000').raw,
            HashZero
          )
        ).to.be.reverted
      })
    })
  })
})
