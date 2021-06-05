import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { BigNumber } from '../../../shared/Units'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('getAllPoolsLength', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns 0 when no pools have been created', async () => {
    expect(await context.primitiveEngine.getAllPoolsLength()).to.deep.equal(BigNumber.from(0))
  })
})
