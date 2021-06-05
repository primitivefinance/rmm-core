import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { constants } from 'ethers'
import { parseEther, parseWei, PERCENTAGE } from '../../../shared/Units'

import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from '../fixtures/createFixture'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseEther('1100')]

describe('create', () => {
  let context: PrimitiveEngineCreateFixture

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineCreateFixture)
    const [deployer] = context.signers
    await context.risky.mock.allowance.withArgs(deployer.address, context.create.address).returns(constants.MaxUint256)
    await context.stable.mock.allowance.withArgs(deployer.address, context.create.address).returns(constants.MaxUint256)

    await context.risky.mock.transferFrom
      .withArgs(deployer.address, context.primitiveEngine.address, context.create.address)
      .returns(true)
    await context.stable.mock.transferFrom
      .withArgs(deployer.address, context.primitiveEngine.address, context.create.address)
      .returns(constants.MaxUint256)
  })

  describe('when the parameters are valid', () => {
    it('deploys a new pool', async () => {
      await context.create.create(strike, sigma, time, spot)
    })

    it('emits the Create event', async () => {
      const [deployer] = context.signers
      await expect(context.create.create(strike, sigma, time, spot))
        .to.emit(context.primitiveFactory, 'Create')
        .withArgs(
          deployer.address,
          '0x0f9be503f4dda9fd2a3c37ac50ff9d7a0459677a989225e86f32b16fea06a547',
          strike,
          sigma,
          time
        )
    })
  })
})
