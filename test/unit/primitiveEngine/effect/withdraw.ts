import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { parseWei, BigNumber } from '../../../shared/Units'
const { createFixtureLoader } = waffle

import { primitiveEngineWithdrawFixture, PrimitiveEngineWithdrawFixture } from '../fixtures/withdrawFixture'

describe('withdraw', function () {
  let context: PrimitiveEngineWithdrawFixture
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let [signer, signer2]: Wallet[] = waffle.provider.getWallets()

  before('Generate fixture loader', async function () {
    loadFixture = createFixtureLoader([signer, signer2])
  })

  beforeEach(async function () {
    context = await loadFixture(primitiveEngineWithdrawFixture)
  })

  describe('when the parameters are valid', function () {
    it('successfully withdraws', async function () {
      await context.withdraw.withdraw(parseWei('1000').raw, parseWei('1000').raw)
      expect(await context.primitiveEngine.margins(context.deposit.address)).to.be.deep.eq([
        BigNumber.from(0),
        BigNumber.from(0),
      ])
    })

    it('reverts when the user attempts to withdraw more than their margin balance', async function () {
      await expect(context.withdraw.withdraw(parseWei('2000').raw, parseWei('2000').raw)).to.be.reverted
    })
  })
})
