import { parseWei } from 'web3-units'

import expect from '../../shared/expect'
import { libraryFixture } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

import { TestMargin } from '../../../typechain'

testContext('testMargin', function () {
  beforeEach(async function () {
    const fixture = await this.loadFixture(libraryFixture)
    this.libraries = fixture.libraries
  })

  describe('margin library', function () {
    let margin: TestMargin, before: any

    beforeEach(async function () {
      margin = this.libraries.testMargin
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
