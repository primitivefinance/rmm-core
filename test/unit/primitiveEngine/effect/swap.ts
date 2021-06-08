import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, Wallet } from 'ethers'
import { parseWei, PERCENTAGE } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineSwapFixture, PrimitiveEngineSwapFixture } from '../fixtures/swapFixture'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('swap', function () {
  let context: PrimitiveEngineSwapFixture
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    context = await loadFixture(primitiveEngineSwapFixture)
  })

  describe('when the parameters are valid', function () {
    it('swaps risky for stable', async function () {
      let risky = context.risky
      let stable = context.stable
      let eng = context.primitiveEngine
      let create = context.create
      await create.create(strike, sigma, time, spot)
      let [pid, riskyForStable, deltaOut, deltaInMax] = [
        await eng.getPoolId(strike, sigma, time),
        true,
        parseWei('0.01').raw,
        constants.MaxUint256,
      ]
      await context.swap.swap(pid, riskyForStable, deltaOut, deltaInMax, false)
    })
  })
})
