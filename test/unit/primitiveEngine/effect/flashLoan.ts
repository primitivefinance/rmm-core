import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import loadContext from '../../context'
import { parseWei } from '../../../shared/Units'

const empty = constants.HashZero

describe('flashLoan', function () {
  before(async function () {
    await loadContext(waffle.provider, ['flashBorrower']);
  })

  describe('when funds are available', function () {
    beforeEach(async function () {
      await this.contracts.risky.mint(
        this.contracts.engine.address,
        parseWei('100').raw,
      )

      await this.contracts.risky.mint(
        this.contracts.flashBorrower.address,
        parseWei('101').raw,
      )
    })

    it('lends the funds', async function () {
      await this.contracts.flashBorrower.flashLoan(
        this.contracts.engine.address,
        this.contracts.risky.address,
        parseWei('100').raw,
        empty,
      )
    })

    it('')
  })
})
