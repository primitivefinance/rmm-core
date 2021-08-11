import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, BytesLike, Wallet } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, lastTimestamp, delta } = config
const empty: BytesLike = constants.HashZero

export async function beforeEachAllocate(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000').raw)

  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, empty)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  await contracts.engineAllocate.allocateFromExternal(poolId, signers[0].address, parseWei('100').raw, empty)
}

describe('allocate', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate'], beforeEachAllocate)
  })

  let poolId: string
  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  })

  describe('when allocating from margin', function () {
    beforeEach(async function () {
      await this.contracts.engineDeposit.deposit(
        this.contracts.engineAllocate.address,
        parseWei('1000').raw,
        parseWei('1000').raw,
        empty
      )
    })

    describe('success cases', function () {
      it('updates the position if enough risky and stable were deposited', async function () {
        const posId = await this.contracts.engineAllocate.getPosition(poolId)

        await this.contracts.engineAllocate.allocateFromMargin(
          poolId,
          this.contracts.engineAllocate.address,
          parseWei('1').raw,
          empty
        )

        expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
          BigNumber.from('0'),
          parseWei('1').raw,
          BigNumber.from('0'),
        ])
      })

      it('emits the Allocated event', async function () {
        await expect(
          this.contracts.engineAllocate.allocateFromMargin(
            poolId,
            this.contracts.engineAllocate.address,
            parseWei('1').raw,
            empty
          )
        ).to.emit(this.contracts.engine, 'Allocated')
      })
    })

    describe('fail cases', function () {
      it('reverts if not risky or stable are insufficient', async function () {
        await expect(
          this.contracts.engineAllocate.allocateFromMargin(
            poolId,
            this.contracts.engineAllocate.address,
            parseWei('10000000').raw,
            empty
          )
        ).to.be.reverted
      })

      it('reverts if there is no liquidity', async function () {
        await expect(
          this.contracts.engineAllocate.allocateFromMargin(empty, this.signers[0].address, parseWei('1').raw, empty)
        ).to.be.revertedWith('UninitializedError()')
      })

      it('reverts if the deltas are 0', async function () {
        await expect(
          this.contracts.engineAllocate.allocateFromMargin(poolId, this.signers[0].address, '0', empty)
        ).to.be.revertedWith('ZeroDeltasError()')
      })
    })
  })

  describe('when allocating from external', function () {
    describe('success cases', function () {
      it('updates the position if enough risky and stable are provided', async function () {
        const posId = await this.contracts.engineAllocate.getPosition(poolId)

        await this.contracts.engineAllocate.allocateFromExternal(
          poolId,
          this.contracts.engineAllocate.address,
          parseWei('1').raw,
          empty
        )

        expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
          BigNumber.from('0'),
          parseWei('1').raw,
          BigNumber.from('0'),
        ])
      })

      it('transfers the tokens', async function () {
        const reserve = await this.contracts.engine.reserves(poolId)

        const deltaX = parseWei('1').mul(reserve.reserveRisky).div(reserve.liquidity)
        const deltaY = parseWei('1').mul(reserve.reserveStable).div(reserve.liquidity)

        const riskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)
        const stableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)

        await this.contracts.engineAllocate.allocateFromExternal(
          poolId,
          this.contracts.engineAllocate.address,
          parseWei('1').raw,
          empty
        )

        expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(riskyBalance.sub(deltaX.raw))
        expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(stableBalance.sub(deltaY.raw))
      })
    })

    describe('fail cases', function () {
      it('reverts if risky or stable are insufficient', async function () {
        await expect(
          this.contracts.engineAllocate.allocateFromExternal(
            poolId,
            this.contracts.engineAllocate.address,
            parseWei('10000').raw,
            empty
          )
        ).to.be.reverted
      })
    })
  })
})
