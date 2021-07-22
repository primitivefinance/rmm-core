import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike } from 'ethers'

import { parseWei } from 'web3-units'

import { depositFragment } from '../fragments'

import loadContext from '../../context'
const empty: BytesLike = constants.HashZero

describe('deposit', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineDeposit', 'badEngineDeposit'], depositFragment)
  })

  describe('success cases', function () {
    it('adds to the user margin account', async function () {
      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('1001').raw, parseWei('999').raw, empty)

      const margin = await this.contracts.engine.margins(this.signers[0].address)

      expect(margin.balanceRisky).to.equal(parseWei('1001').raw)
      expect(margin.balanceStable).to.equal(parseWei('999').raw)
    })

    it('adds to the margin account of another address when specified', async function () {
      await this.contracts.engineDeposit.deposit(
        this.contracts.engineDeposit.address,
        parseWei('1000').raw,
        parseWei('1000').raw,
        empty
      )

      expect(await this.contracts.engine.margins(this.contracts.engineDeposit.address)).to.be.deep.eq([
        parseWei('1000').raw,
        parseWei('1000').raw,
      ])
    })

    it('increases the balances of the engine contract', async function () {
      const riskyBalance = await this.contracts.risky.balanceOf(this.contracts.engine.address)
      const stableBalance = await this.contracts.stable.balanceOf(this.contracts.engine.address)

      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('500').raw, parseWei('250').raw, empty)

      expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.equal(
        riskyBalance.add(parseWei('500').raw)
      )

      expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.equal(
        stableBalance.add(parseWei('250').raw)
      )
    })

    it('increases the previous margin when called another time', async function () {
      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('1001').raw, parseWei('999').raw, empty)
      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('999').raw, parseWei('1001').raw, empty)

      const margin = await this.contracts.engine.margins(this.signers[0].address)

      expect(margin.balanceRisky).to.equal(parseWei('2000').raw)
      expect(margin.balanceStable).to.equal(parseWei('2000').raw)
    })

    it('emits the Deposited event', async function () {
      await expect(
        this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw, empty)
      )
        .to.emit(this.contracts.engine, 'Deposited')
        .withArgs(this.contracts.engineDeposit.address, this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw)
    })
  })

  describe('fail cases', function () {
    it('reverts when the user does not have sufficient funds', async function () {
      await expect(
        this.contracts.engineDeposit.deposit(
          this.contracts.engineDeposit.address,
          constants.MaxUint256.div(2),
          constants.MaxUint256.div(2),
          empty
        )
      ).to.be.reverted
    })

    it('reverts when the callback did not transfer the stable', async function () {
      await expect(
        this.contracts.badEngineDeposit.deposit(
          this.signers[0].address,
          parseWei('1000').raw,
          parseWei('1000').raw,
          empty,
          0
        )
      ).to.revertedWith('StableBalanceError()')
    })

    it('reverts when the callback did not transfer the risky', async function () {
      await expect(
        this.contracts.badEngineDeposit.deposit(
          this.signers[0].address,
          parseWei('1000').raw,
          parseWei('1000').raw,
          empty,
          1
        )
      ).to.revertedWith('RiskyBalanceError()')
    })

    it('reverts when the callback did not transfer the risky or the stable', async function () {
      await expect(
        this.contracts.badEngineDeposit.deposit(
          this.signers[0].address,
          parseWei('1000').raw,
          parseWei('1000').raw,
          empty,
          2
        )
      ).to.revertedWith('RiskyBalanceError()')
    })
  })
})
