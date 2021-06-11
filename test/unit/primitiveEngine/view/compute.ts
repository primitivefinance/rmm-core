import { expect } from 'chai'
import { BigNumber } from '../../../shared/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('compute', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })

  it('returns 0 for all fields when the margin account is uninitialized', async function () {
    expect(
      await this.contracts.engine.compute(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        this.contracts.risky.address,
        BigNumber.from(10).pow(18)
      )
    ).to.be.reverted
  })
})
