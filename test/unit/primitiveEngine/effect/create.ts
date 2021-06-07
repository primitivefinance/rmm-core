import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import { constants } from 'ethers'
import { createEngineFunctions, CreateFunction } from '../../../shared/Engine'
import { parseEther, parseWei, PERCENTAGE } from '../../../shared/Units'
import { TestBlackScholes, TestBlackScholes__factory } from '../../../../typechain'

import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from '../fixtures/createFixture'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('create', () => {
  let context: PrimitiveEngineCreateFixture, create: CreateFunction

  beforeEach(async () => {
    context = await loadFixture(primitiveEngineCreateFixture)
    const [deployer] = context.signers
    const bs = await new TestBlackScholes__factory(deployer).deploy(context.primitiveEngine.address)
    ;({ create } = createEngineFunctions({
      target: context.create,
      TX1: context.risky,
      TY2: context.stable,
      engine: context.primitiveEngine,
      signer: deployer,
      bs: bs,
    }))
  })

  describe('when the parameters are valid', () => {
    it('deploys a new pool', async () => {
      await create(strike, sigma, time, spot)
    })

    it('emits the Create event', async () => {
      const [deployer] = context.signers
      await expect(create(strike, sigma, time, spot))
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
