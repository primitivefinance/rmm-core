import { expect } from 'chai'
import { BigNumber } from '../../../shared/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('getPoolId', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })

  it('returns the poolId given settings', async function () {
    expect(
      await this.contracts.engine.getPoolId(
        BigNumber.from(10).pow(18),
        BigNumber.from(10).pow(18),
        BigNumber.from(10).pow(18)
      )
    ).to.equal('0x0f9be503f4dda9fd2a3c37ac50ff9d7a0459677a989225e86f32b16fea06a547')
  })
})
