import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { BigNumber } from '../../../shared/Units'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('position', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns 0 for all fields when the position is uninitialized', async () => {
    expect(
      await context.primitiveEngine.positions('0x6de0b49963079e3aead2278c2be4a58cc6afe973061c653ee98b527d1161a3c5')
    ).to.deep.equal([
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      BigNumber.from(0),
      BigNumber.from(0),
      BigNumber.from(0),
      BigNumber.from(0),
      BigNumber.from(0),
    ])
  })
})
