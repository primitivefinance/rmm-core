import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { TestPosition } from '../../../typechain'
import { parseWei } from 'web3-units'
import { utils, BytesLike } from 'ethers'
import loadContext from '../context'

describe('testPosition', function () {
  before(async function () {
    loadContext(waffle.provider, ['testPosition'])
  })

  describe('position', function () {
    let position: TestPosition, poolId: BytesLike, posId: BytesLike, before: any

    beforeEach(async function () {
      position = this.contracts.testPosition.connect(this.signers[0])
      poolId = utils.keccak256(utils.solidityPack(['string'], ['position']))
      await position.beforeEach(poolId, parseWei('1').raw)
      posId = await position.posId()
      before = await position.pos()
    })

    it('shouldFetch', async function () {
      expect(await position.shouldFetch(this.signers[0].address, poolId)).to.be.deep.eq(before)
    })
    it('shouldAllocate', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldAllocate(poolId, amount)
      expect((await position.pos()).liquidity).to.be.deep.eq(before.liquidity.add(amount))
    })
    it('shouldRemove', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldAllocate(poolId, amount) // allocate so we can remove
      await position.shouldRemove(poolId, amount)
      expect((await position.pos()).liquidity).to.be.deep.eq(before.liquidity) // no change since we added and removed
    })
    it('shouldBorrow', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldRemove(poolId, (await position.pos()).liquidity) // remove all liq so we can borrow
      expect((await position.pos()).liquidity).to.be.eq(0) // liq must be 0 to borrow
      await position.shouldBorrow(poolId, amount, amount)
      expect((await position.pos()).liquidity).to.be.deep.eq(0) // removed all liquidity
      expect((await position.pos()).riskyCollateral).to.be.deep.eq(before.riskyCollateral.add(amount))
      expect((await position.pos()).stableCollateral).to.be.deep.eq(before.stableCollateral.add(amount))
    })
    it('shouldSupply', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldAllocate(poolId, amount) // allocate so we can supply
      await position.shouldSupply(poolId, amount)
      expect((await position.pos()).float).to.be.deep.eq(before.float.add(amount))
    })
    it('shouldClaim', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldAllocate(poolId, amount) // allocate so we can supply
      await position.shouldSupply(poolId, amount) // supply so we can claim
      await position.shouldClaim(poolId, amount)
      expect((await position.pos()).float).to.be.deep.eq(before.float) // no chnage since we lent and claimed
    })
    it('shouldRepay', async function () {
      let amount = parseWei('0.1').raw
      await position.shouldRemove(poolId, (await position.pos()).liquidity) // remove all liq so we can borrow
      await position.shouldBorrow(poolId, amount, amount)
      await position.shouldRepay(poolId, amount, amount) // borrow from this account so we can repay
      expect((await position.pos()).liquidity).to.be.deep.eq(0)
      expect((await position.pos()).riskyCollateral).to.be.deep.eq(before.riskyCollateral) // no change
      expect((await position.pos()).stableCollateral).to.be.deep.eq(before.stableCollateral) // no change
    })
    it('shouldGetPositionId', async function () {
      expect(await position.shouldGetPositionId(this.signers[0].address, poolId)).to.be.deep.eq(
        utils.keccak256(utils.solidityPack(['address', 'bytes32'], [this.signers[0].address, poolId]))
      )
    })
  })
})
