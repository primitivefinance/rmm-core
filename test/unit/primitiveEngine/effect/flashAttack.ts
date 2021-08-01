import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import loadContext from '../../context'
import { parseWei } from 'web3-units'

const empty = constants.HashZero

describe('flashAttack', function () {
  before(async function () {
    loadContext(waffle.provider, ['flashAttacker'])
  })

  describe('attacks using the flash loan feature and returns tokens through a deposit call', function () {
    beforeEach(async function () {
      await this.contracts.risky.mint(this.contracts.engine.address, parseWei('100').raw)

      await this.contracts.risky.mint(this.contracts.flashAttacker.address, parseWei('101').raw)
      await this.contracts.risky.approve(this.contracts.flashAttacker.address, constants.MaxUint256)
      await this.contracts.stable.approve(this.contracts.flashAttacker.address, constants.MaxUint256)
    })

    it('successfully uses flash loan to drain the funds into the attacker contract', async function () {
      const bal0 = await this.contracts.risky.balanceOf(this.contracts.flashAttacker.address)
      console.log(`\n Balance before: ${bal0}`)
      await this.contracts.flashAttacker.flashBorrow(
        this.contracts.engine.address,
        this.contracts.risky.address,
        parseWei('100').raw,
        0,
        empty
      )
      const bal1 = await this.contracts.risky.balanceOf(this.contracts.flashAttacker.address)
      console.log(`\n Balance after: ${bal1}`)
      expect(bal1).to.be.gte(bal0)
    })

    it('fails to increases the engine token balance', async function () {
      const balance = await this.contracts.risky.balanceOf(this.contracts.engine.address)

      const fee = await this.contracts.engine.flashFee(this.contracts.risky.address, parseWei('100').raw)

      await this.contracts.flashAttacker.flashBorrow(
        this.contracts.engine.address,
        this.contracts.risky.address,
        parseWei('100').raw,
        0,
        empty
      )

      expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.not.equal(balance.add(fee))
    })
  })
})
