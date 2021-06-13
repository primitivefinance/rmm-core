import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants } from 'ethers'

import { parseWei, PERCENTAGE, BytesLike } from '../../../shared/Units'

import { borrowFragment } from '../fragments'

import loadContext from '../../context'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('borrow', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineLend', 'engineBorrow'],
      borrowFragment
    )
  })

  describe('when the parameters are valid', function () {
    it('originates one long option position', async function () {
      const pid = await this.contracts.engine.getPoolId(strike, sigma, time)
      const posid = await this.contracts.engineBorrow.getPosition(pid)
      await this.contracts.engineBorrow.borrow(pid, this.contracts.engineBorrow.address, parseWei('1').raw, empty)

      expect(await this.contracts.engine.positions(posid)).to.be.deep.eq([
        parseWei('1').raw,
        parseWei('0').raw,
        parseWei('0').raw,
        parseWei('0').raw,
        parseWei('1').raw,
      ])
    })

    it('fails to originate more long option positions than are allocated to float', async function () {
      const pid = await this.contracts.engine.getPoolId(strike, sigma, time)
      await expect(this.contracts.engineBorrow.borrow(pid, this.contracts.engineBorrow.address, parseWei('200').raw, empty))
        .to.be.reverted
    })
  })
})
