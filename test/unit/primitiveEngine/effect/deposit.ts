import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike } from 'ethers'

import { parseWei } from '../../../shared/Units'

import { depositFragment } from '../fragments'

import loadContext from '../../context'
const empty: BytesLike = constants.HashZero

describe('deposit', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineDeposit'], depositFragment)
  })

  describe('when the parameters are valid', function () {
    it('adds to the user margin account', async function () {
      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw, empty)

      expect(await this.contracts.engine.margins(this.signers[0].address)).to.be.deep.eq([
        parseWei('1000').raw,
        parseWei('1000').raw,
      ])
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

    it('reverts when the user has insufficient funds', async function () {
      await expect(
        this.contracts.engineDeposit.deposit(
          this.contracts.engineDeposit.address,
          constants.MaxUint256.div(2),
          constants.MaxUint256.div(2),
          empty
        )
      ).to.be.reverted
    })
  })
})
