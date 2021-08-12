import expect from '../../../shared/expect'
import { BigNumber } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('reserves', function () {
  before(async function () {
    loadContext(waffle.provider, [])
  })

  it('returns 0 for all fields when the pool is uninitialized', async function () {
    expect(
      await this.contracts.engine.reserves('0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5')
    ).to.deep.equal([
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
      0,
      BigNumber.from('0'),
      BigNumber.from('0'),
      BigNumber.from('0'),
    ])
  })
})
