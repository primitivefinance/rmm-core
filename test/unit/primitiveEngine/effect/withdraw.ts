import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, Wallet } from 'ethers'

import { parseWei } from 'web3-units'

import loadContext from '../../context'
import { Contracts } from '../../../../types'

const empty = constants.HashZero

export async function beforeEachWithdraw(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.risky.mint(signers[0].address, constants.MaxUint256.div(4))
  await contracts.engineDeposit.deposit(contracts.engineWithdraw.address, parseWei('1000').raw, parseWei('1000').raw, empty)
}

describe('withdraw', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineDeposit', 'engineWithdraw'], beforeEachWithdraw)
  })

  describe('success cases', function () {
    it('withdraws from the margin account', async function () {
      await this.contracts.engineWithdraw.withdraw(parseWei('999').raw, parseWei('998').raw)

      const margin = await this.contracts.engine.margins(this.contracts.engineWithdraw.address)

      expect(margin.balanceRisky).to.equal(parseWei('1').raw)
      expect(margin.balanceStable).to.equal(parseWei('2').raw)
    })

    it('transfers the tokens', async function () {
      const riskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)
      const stableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)

      await this.contracts.engineWithdraw.withdraw(parseWei('500').raw, parseWei('250').raw)

      expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(riskyBalance.add(parseWei('500').raw))

      expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(stableBalance.add(parseWei('250').raw))
    })

    it('emits the Withdrawn event', async function () {
      await expect(this.contracts.engineWithdraw.withdraw(parseWei('1000').raw, parseWei('1000').raw))
        .to.emit(this.contracts.engine, 'Withdrawn')
        .withArgs(this.contracts.engineWithdraw.address, this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw)
    })
  })

  describe('fail cases', function () {
    it('reverts when attempting to withdraw more than is in margin', async function () {
      await expect(this.contracts.engineWithdraw.withdraw(constants.MaxUint256.div(2), constants.MaxUint256.div(2))).to.be
        .reverted
    })
  })
})
