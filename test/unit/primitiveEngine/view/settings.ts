import expect from '../../.../../../shared/expect'
import { BigNumber } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('settings (calibration)', function () {
  before(async function () {
    loadContext(waffle.provider, [], async function () {})
  })

  it('returns 0 for all fields when the pool is uninitialized', async function () {
    const foo = await this.contracts.engine.calibrations(
      '0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5'
    )
    expect(
      await this.contracts.engine.calibrations('0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5')
    ).to.deep.equal([BigNumber.from('0'), BigNumber.from('0'), 0, 0])
  })
})
