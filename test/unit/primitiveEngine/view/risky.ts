import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../../fixtures'

describe('owner', () => {
  let context: PrimitiveEngineFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineFixture)
  })

  it('returns the deployer of the contract as the owner', async () => {
    expect(await context.primitiveEngine.risky()).to.equal(context.risky.address)
  })
})
