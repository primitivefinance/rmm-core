import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { parseWei, PERCENTAGE, BytesLike } from '../../../shared/Units'

import { removeFragment } from '../fragments'

import loadContext from '../../context'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]

const empty: BytesLike = constants.HashZero

describe('remove', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineRemove'], removeFragment)
  })

  describe('when the parameters are valid', function () {
    it('removes 1 liquidity share and deposits the resultant risky and stable to margin', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      const posid = await this.contracts.engineRemove.getPosition(poolId)
      console.log('removing from poolId', poolId.slice(0, 5))
      console.log('engine', this.contracts.engine.address.slice(0, 5))
      await this.contracts.engineRemove.removeToMargin(poolId, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posid)).to.be.deep.eq([
        BigNumber.from('0'),
        BigNumber.from('0'),
        BigNumber.from('0'),
        parseWei('9').raw,
        BigNumber.from('0'),
      ])
    })

    it('removes 1 liquidity share and sends the resultant risky and stable to engineDeposit.address', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      const posid = await this.contracts.engineRemove.getPosition(poolId)
      await this.contracts.engineRemove.removeToExternal(poolId, parseWei('1').raw, empty)
      expect(await this.contracts.engine.positions(posid)).to.be.deep.eq([
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
