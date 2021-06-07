import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { BigNumber } from '../../../shared/Units'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('margins', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns 0 for all fields when the margin account is uninitialized', async () => {
    expect(await context.primitiveEngine.margins('0x882efb9e67eda9bf74766e8686259cb3a1fc8b8a')).to.deep.equal([
      BigNumber.from(0),
      BigNumber.from(0),
      false,
    ])
  })
})
