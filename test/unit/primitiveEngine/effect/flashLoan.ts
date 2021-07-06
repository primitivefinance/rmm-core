import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import loadContext from '../../context'
import { parseWei } from 'web3-units'

const empty = constants.HashZero

describe('flashLoan', function () {
  before(async function () {
    await loadContext(waffle.provider, ['flashBorrower'])
  })

  describe('when funds are available', function () {
    beforeEach(async function () {
      await this.contracts.risky.mint(this.contracts.engine.address, parseWei('100').raw)

      await this.contracts.risky.mint(this.contracts.flashBorrower.address, parseWei('101').raw)
    })

    it('lends the funds', async function () {
      await this.contracts.flashBorrower.flashBorrow(
        this.contracts.engine.address,
        this.contracts.risky.address,
        parseWei('100').raw,
        0,
        empty
      )
    })

    it('increases the engine token balance', async function () {
      const balance = await this.contracts.risky.balanceOf(this.contracts.engine.address)

      const fee = await this.contracts.engine.flashFee(this.contracts.risky.address, parseWei('100').raw)

      await this.contracts.flashBorrower.flashBorrow(
        this.contracts.engine.address,
        this.contracts.risky.address,
        parseWei('100').raw,
        0,
        empty
      )

      expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.equal(balance.add(fee))
    })

    it('emits the Flash event', async function () {
      const fee = await this.contracts.engine.flashFee(this.contracts.risky.address, parseWei('100').raw)

      await expect(
        this.contracts.flashBorrower.flashBorrow(
          this.contracts.engine.address,
          this.contracts.risky.address,
          parseWei('100').raw,
          0,
          empty
        )
      )
        .to.emit(this.contracts.engine, 'Flash')
        .withArgs(
          this.contracts.flashBorrower.address,
          this.contracts.flashBorrower.address,
          this.contracts.risky.address,
          parseWei('100').raw,
          fee
        )
    })

    it('reverts if the fees are not paid', async function () {
      await expect(
        this.contracts.flashBorrower.flashBorrow(
          this.contracts.engine.address,
          this.contracts.risky.address,
          parseWei('100').raw,
          1,
          empty
        )
      ).to.reverted
    })

    it('reverts if the funds are not returned', async function () {
      await expect(
        this.contracts.flashBorrower.flashBorrow(
          this.contracts.engine.address,
          this.contracts.risky.address,
          parseWei('100').raw,
          2,
          empty
        )
      ).to.reverted
    })
  })

  describe('when funds are not available', function () {
    it('reverts if token is not supported', async function () {
      await expect(
        this.contracts.flashBorrower.flashBorrow(
          this.contracts.engine.address,
          constants.AddressZero,
          parseWei('100').raw,
          0,
          empty
        )
      ).to.revertedWith('Not supported')
    })

    it('reverts if balance is not sufficient', async function () {
      await expect(
        this.contracts.flashBorrower.flashBorrow(
          this.contracts.engine.address,
          constants.AddressZero,
          parseWei('100').raw,
          0,
          empty
        )
      ).to.reverted
    })
  })
})
