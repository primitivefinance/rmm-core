import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { parseWei, PERCENTAGE } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineCreateFixture, PrimitiveEngineCreateFixture } from '../fixtures/createFixture'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('create', function () {
  let context: PrimitiveEngineCreateFixture
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    context = await loadFixture(primitiveEngineCreateFixture)
  })

  describe('when the parameters are valid', function () {
    it('deploys a new pool', async function () {
      await context.create.createPool(strike, sigma, time, spot)
    })

    it('emits the Create event', async function () {
      await expect(context.create.createPool(strike, sigma, time, spot))
        .to.emit(context.primitiveEngine, 'Create')
        .withArgs(
          context.create.address,
          '0x92b9da098c9dca76cf51e44da14c7c2aabadddf120c176f7e1d4d1cb6a599455',
          strike,
          sigma,
          time
        )
    })

    it('reverts when the pool already exists', async function () {
      await context.create.createPool(strike, sigma, time, spot)
      await expect(context.create.createPool(strike, sigma, time, spot)).to.be.revertedWith('Already created')
    })
  })
})
