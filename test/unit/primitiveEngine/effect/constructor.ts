import { waffle } from 'hardhat'
import { expect } from 'chai'

import loadContext from '../../context'
import { createFragment } from '../fragments'

describe('constructor', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate'], createFragment)
  })

  describe('when the contract is deployed', function () {
    it('has the risky', async function () {
      expect(await this.contracts.engine.risky()).to.equal(this.contracts.risky.address)
    })

    it('has the stable', async function () {
      expect(await this.contracts.engine.stable()).to.equal(this.contracts.stable.address)
    })

    it('has the factory', async function () {
      expect(await this.contracts.engine.factory()).to.equal(this.contracts.factory.address)
    })
  })
})
