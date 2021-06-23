import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { parseWei, PERCENTAGE, BytesLike } from '../../../shared/Units'

import { removeFragment } from '../fragments'

import loadContext from '../../context'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]

const empty: BytesLike = constants.HashZero
let pid: string
let posId: string

describe('remove', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineRemove'], removeFragment)
  })

  describe('when removing to internal', function () {
    beforeEach(async function () {
      pid = await this.contracts.engine.getPoolId(strike, sigma, time)
      posId = await this.contracts.engineRemove.getPosition(pid)
    })

    it('updates the position', async function () {
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    it('updates the margin', async function () {
      const delLiquidity = parseWei('1')

      await this.contracts.engineRemove.removeToMargin(pid, delLiquidity.raw, empty)

      const res = await this.contracts.engine.reserves(pid)

      const margin = await this.contracts.engine.margins(this.contracts.engineRemove.address)

      const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
      const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)

      expect(margin.balanceRisky).to.equal(delRisky.raw)

      expect(margin.balanceStable).to.equal(delStable.raw)
    })
  })
})

/*
    it('updates the margin', async function () {
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)
      const margin = await this.contracts.engine.margins(
        this.contracts.engineRemove.address
      )

      const res = await this.contracts.engine.reserves(pid)

      expect(
        margin.balanceRisky,
      ).to.equal(
        parseWei('1').mul(res.reserveRisky).div(res.liquidity)
      )

      expect(
        margin.balanceRisky,
      ).to.equal(
        parseWei('1').mul(res.reserveStable).div(res.liquidity)
      )
    })

    it('updates the reserves', async function ()  {
      const posId = await this.contracts.engineRemove.getPosition(pid)
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    // TODO: Finish this test
    it('emits the Removed event', async function () {
      await expect(
        this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)
      ).to.emit(
        this.contracts.engine,
        'Removed',
      )
    })

    it('reverts if deltaL is 0', async function () {
      await this.contracts.engineRemove.removeToMargin(pid, 0, empty)
    })
  })

  describe.skip('when removing to external', function () {
    it('updates the position', async function ()  {
      const posId = await this.contracts.engineRemove.getPosition(pid)
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    it('transfers the tokens', async function ()  {
      const posId = await this.contracts.engineRemove.getPosition(pid)
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })


  })

  describe.skip('when the parameters are valid', function () {
    it('removes 1 liquidity share and deposits the resultant risky and stable to margin', async function () {
      const posId = await this.contracts.engineRemove.getPosition(pid)
      await this.contracts.engineRemove.removeToMargin(pid, parseWei('1').raw, empty)
      
      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    it('removes 1 liquidity share and sends the resultant risky and stable to engineDeposit.address', async function () {
      const pid = await this.contracts.engine.getPoolId(strike, sigma, time)
      const posId = await this.contracts.engineRemove.getPosition(pid)
      await this.contracts.engineRemove.removeToExternal(pid, parseWei('1').raw, empty)
      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    it('fails to remove more liquidity to margin than is allocated by the address', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      await expect(this.contracts.engineRemove.removeToMargin(poolId, parseWei('20').raw, empty)).to.be.reverted
    })

    it('fails to remove more liquity to engineRemove.address than is allocated by the address', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      await expect(this.contracts.engineRemove.removeToExternal(poolId, parseWei('20').raw, empty)).to.be.reverted
    })
  })
})
*/
