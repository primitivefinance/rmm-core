import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestMargin } from '../../../typechain'
import { parseWei } from 'web3-units'
import loadContext from '../context'

describe('testMargin', function () {
  before(async function () {
    loadContext(waffle.provider, ['testMargin'])
  })

  describe('margin', function () {
    let margin: TestMargin, before: any

    beforeEach(async function () {
      margin = this.contracts.testMargin
      before = await margin.margin()
    })

    it('shouldDeposit', async function () {
      let delta = parseWei('1').raw
      await margin.shouldDeposit(delta, delta)
      let after = await margin.margin()
      expect(after.balanceRisky).to.be.deep.eq(before.balanceRisky.add(delta))
      expect(after.balanceStable).to.be.deep.eq(before.balanceStable.add(delta))
    })

    it('shouldWithdraw', async function () {
      let delta = parseWei('1').raw
      await margin.shouldDeposit(delta, delta)
      await margin.shouldWithdraw(delta, delta)
      let after = await margin.margin()
      expect(after.balanceRisky).to.be.deep.eq(before.balanceRisky)
      expect(after.balanceStable).to.be.deep.eq(before.balanceStable)
    })
  })
})
