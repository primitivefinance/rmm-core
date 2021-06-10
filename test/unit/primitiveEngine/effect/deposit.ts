import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, utils, } from 'ethers'

import {
  depositFragment,
} from '../fragments'

import { loadContext } from '../../context'

describe('deposit', function () {
  let engineAddress: string;

  before(async function () {
    loadContext(
      waffle.provider,
      ['factory', 'engineDeposit', 'risky', 'stable'],
      depositFragment,
    );
  });

  beforeEach(async function () {
    engineAddress = await this.contracts.factory.getEngine(
      this.contracts.risky.address,
      this.contracts.stable.address
    )
  })

  describe('when the parameters are valid', function () {
    it('adds to the user margin account', async function () {
      await this.contracts.engineDeposit.deposit(
        engineAddress,
        this.contracts.risky.address,
        this.contracts.stable.address,
        this.signers[0].address,
        utils.parseEther('1000'),
        utils.parseEther('1000'),
      );

      expect(await this.contracts.engine.margins(this.signers[0].address)).to.be.deep.eq([
        utils.parseEther('1000'),
        utils.parseEther('1000'),
      ])
    })

    it('adds to the margin account of another address when specified', async function () {
      await this.contracts.engineDeposit.deposit(
        engineAddress,
        this.contracts.risky.address,
        this.contracts.stable.address,
        this.contracts.engineDeposit.address,
        utils.parseEther('1000'),
        utils.parseEther('1000'),
      );

      expect(await this.contracts.engine.margins(this.contracts.engineDeposit.address)).to.be.deep.eq([
        utils.parseEther('1000'),
        utils.parseEther('1000'),
      ])
    })

    it('reverts when the user has insufficient funds', async function () {
      await expect(
        this.contracts.engineDeposit.deposit(
          engineAddress,
          this.contracts.risky.address,
          this.contracts.stable.address,
          this.contracts.engineDeposit.address,
          constants.MaxUint256.div(2),
          constants.MaxUint256.div(2),
        ),
      ).to.be.reverted
    })
  })
})
