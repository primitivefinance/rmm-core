import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { BigNumber } from '../../../shared/Units'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('getPoolId', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns the poolId given settings', async () => {
    expect(
      await context.primitiveEngine.getPoolId(
        BigNumber.from(10).pow(18),
        BigNumber.from(10).pow(18),
        BigNumber.from(10).pow(18)
      )
    ).to.equal('0x0f9be503f4dda9fd2a3c37ac50ff9d7a0459677a989225e86f32b16fea06a547')
  })
})
