import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { parseWei, BigNumber } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineAllocateFixture, PrimitiveEngineAllocateFixture } from '../fixtures/allocateFixture'
import { Fixture } from '@ethereum-waffle/provider'

describe('withdraw', function () {
  let context: PrimitiveEngineAllocateFixture
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    context = await loadFixture(primitiveEngineAllocateFixture)
  })

  describe('when the parameters are valid', function () {
    it('successfully mint 1 LP share on the curve', async function () {
      await context.allocate.allocateFromMargin(context.pid, context.allocate.address, BigNumber.from(1))
    })

    it('reverts when the user attempts to withdraw more than their margin balance', async function () {
      await expect(context.allocate.allocateFromMargin(context.pid, context.allocate.address, BigNumber.from(1)))
        .to.emit(context.primitiveEngine, 'Allocated')
        .withArgs([context.allocate.address])
    })
  })
})
