import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, BytesLike } from 'ethers'
import { parseWei } from 'web3-units'

import { allocateFragment } from '../fragments'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'

const { strike, sigma, maturity, spot } = config
const empty: BytesLike = constants.HashZero
let poolId: string

describe('allocate', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate'], allocateFragment)
  })

  describe('when allocating from margin', function () {
    beforeEach(async function () {
      await this.contracts.engineDeposit.deposit(
        this.contracts.engineAllocate.address,
        parseWei('1000').raw,
        parseWei('1000').raw,
        empty
      )

      poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
    })

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

    it('reverts if not risky or stable are insufficient', async function () {
      await expect(
        this.contracts.engineAllocate.allocateFromMargin(
          poolId,
          this.contracts.engineAllocate.address,
          parseWei('10').raw,
          empty
        )
      ).to.reverted
    })

    it('reverts if there is no liquidity', async function () {
      await expect(
        this.contracts.engineAllocate.allocateFromMargin(
          '0x41b1a0649752af1b28b3dc29a1556eee781e4a4c3a1f7f53f90fa834de098c4d',
          this.signers[0].address,
          parseWei('1').raw,
          empty
        )
      ).to.revertedWith('Not initialized')
    })

    it('reverts if the deltas are 0', async function () {
      await expect(
        this.contracts.engineAllocate.allocateFromMargin(poolId, this.signers[0].address, '0', empty)
      ).to.revertedWith('Deltas are 0')
    })
  })

  describe('when allocating from external', function () {
    beforeEach(async function () {
      poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
    })

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
