import { waffle } from 'hardhat'
import { expect } from 'chai'

import { PERCENTAGE, parseWei } from '../../../shared/Units'
import loadContext from '../../context'

import { createFragment } from '../fragments'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('create', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate'], createFragment)
  })

  describe('when the parameters are valid', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot)
    })

    it('emits the Create event', async function () {
      await expect(this.contracts.engineCreate.create(strike, sigma, time, spot))
        .to.emit(this.contracts.engine, 'Create')
        .withArgs(
          this.contracts.engineCreate.address,
          '0xbd2b5718c3094a357b195e108feebdacded45272d1086596e5c59b43d017083b',
          strike,
          sigma,
          time
        )
    })

    it('reverts when the pool already exists', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot)
      await expect(this.contracts.engineCreate.create(strike, sigma, time, spot)).to.be.revertedWith('Already created')
    })
  })
})
