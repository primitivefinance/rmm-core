import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, Wallet } from 'ethers'
import { parseWei } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineDepositFixture, PrimitiveEngineDepositFixture } from '../fixtures/depositFixture'

describe('deposit', function () {
  let context: PrimitiveEngineDepositFixture
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    context = await loadFixture(primitiveEngineDepositFixture)
  })

  describe('when the parameters are valid', function () {
    it('adds to the margin account', async function () {
      await context.deposit.deposit(signer.address, parseWei('1000').raw, parseWei('1000').raw)
    })

    it('reverts when the external account does not have enough funds', async function () {
      await expect(context.deposit.deposit(signer.address, constants.MaxUint256.div(2), constants.MaxUint256.div(2))).to.be
        .reverted
    })
  })
})
