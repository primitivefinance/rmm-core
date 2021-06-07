import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { BigNumber } from '../../../shared/Units'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('compute', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns 0 for all fields when the margin account is uninitialized', async () => {
    expect(
      await context.primitiveEngine.compute(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        context.risky.address,
        BigNumber.from(10).pow(18)
      )
    ).to.be.reverted
  })
})
