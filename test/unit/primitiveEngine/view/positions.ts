import { expect } from 'chai'
import { BigNumber } from '../../../shared/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('position', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })

  it('returns 0 for all fields when the position is uninitialized', async function () {
    expect(
      await this.contracts.engine.positions('0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5')
    ).to.deep.equal([BigNumber.from(0), BigNumber.from(0), BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)])
  })
})
