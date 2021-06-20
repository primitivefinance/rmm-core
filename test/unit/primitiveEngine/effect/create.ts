import { waffle } from 'hardhat'
import { expect } from 'chai'

import { PERCENTAGE, parseWei, BytesLike, constants } from '../../../shared/Units'
import loadContext from '../../context'

import { createFragment } from '../fragments'

const [strike, sigma, time, spot] = [
  parseWei('1000').raw,
  0.85 * PERCENTAGE,
  Math.floor(Date.now() / 1000) + 31449600,
  parseWei('1100').raw,
]
const empty: BytesLike = constants.HashZero

describe('create', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate'], createFragment)
  })

  describe('when the parameters are valid', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
    })

    it('emits the Create event', async function () {
      await expect(this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty))
        .to.emit(this.contracts.engine, 'Create')
        .withArgs(this.contracts.engineCreate.address, strike, sigma, time)
    })

    it('reverts when the pool already exists', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
      await expect(
        this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
      ).to.be.revertedWith('Initialized')
    })
  })
})
