import { waffle } from 'hardhat'
import chai, { expect } from 'chai'
import { parseWei } from 'web3-units'
import { constants } from 'ethers'

import { withdrawFragment } from '../fragments'
import loadContext from '../../context'
import { primitiveChai } from '../../matchers'

chai.use(primitiveChai)

describe('deposit / withdraw', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineDeposit', 'engineWithdraw'], withdrawFragment)
  })

  it('withdraws from the margin account', async function () {
    const risky = parseWei('10').raw
    const stable = parseWei('5').raw

    await expect(this.contracts.engineWithdraw.withdraw(risky, stable)).to.decreaseMargin(
      this.contracts.engine,
      this.contracts.engineWithdraw.address,
      risky,
      stable
    )
  })

  it('deposits to the margin account', async function () {
    const risky = parseWei('10').raw
    const stable = parseWei('5').raw

    await expect(
      this.contracts.engineDeposit.deposit(this.contracts.engineWithdraw.address, risky, stable, constants.HashZero)
    ).to.increaseMargin(this.contracts.engine, this.contracts.engineWithdraw.address, risky, stable)
  })
})
