import { waffle } from 'hardhat'
import { expect } from 'chai'
import { TestPosition } from '../../../typechain'
import { parseWei, PERCENTAGE, Wei, fromMantissa, fromInt } from '../../shared/Units'
import loadContext from '../context'

describe('testPosition', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testPosition'], async () => {})
  })

  describe('position', function () {
    let position: TestPosition

    beforeEach(async function () {
      position = this.contracts.testPosition
    })

    it('getProportionalVolatility', async function () {})
  })
})
