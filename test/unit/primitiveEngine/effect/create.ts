import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, Wallet } from 'ethers'
import { createEngineFunctions, CreateFunction } from '../../../shared/Engine'
import { parseEther, parseWei, PERCENTAGE } from '../../../shared/Units'
import { TestBlackScholes, TestBlackScholes__factory } from '../../../../typechain'
const { createFixtureLoader } = waffle

import {
  primitiveEngineCreateFixture,
  PrimitiveEngineCreateFixture,
  PrimitiveFactoryFixture,
} from '../fixtures/createFixture'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('create', function () {
  let context: PrimitiveEngineCreateFixture, create: CreateFunction
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
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
    console.log('calling risky 2', await context.primitiveEngine.risky())
  })

  describe('when the parameters are valid', function () {
    it.only('deploys a new pool', async function () {
      console.log('calling risky 3', await context.primitiveEngine.risky())
      console.log('calling risky 4', await context.create.risky())
      console.log('actual engine addr', context.primitiveEngine.address)
      console.log('engine address in callee', await context.create.engine())
      console.log(strike.toString(), sigma.toString(), time.toString(), spot.toString())
      console.log(await context.create.getEngineRisky())
      //await context.create.createPool(strike, sigma, time, spot)
    })

    it('emits the Create event', async function () {
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
