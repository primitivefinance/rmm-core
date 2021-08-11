import { waffle } from 'hardhat'
import { expect } from 'chai'

import loadContext from '../../context'
import { Contracts } from '../../../../types'
import { constants, Wallet } from 'ethers'

export async function beforeEachCreate(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, constants.MaxUint256)
  await contracts.risky.mint(signers[0].address, constants.MaxUint256)
}

describe('constructor', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate'], beforeEachCreate)
  })

  describe('when the contract is deployed', function () {
    it('has the risky', async function () {
      expect(await this.contracts.engine.risky()).to.equal(this.contracts.risky.address)
    })

    it('has the stable', async function () {
      expect(await this.contracts.engine.stable()).to.equal(this.contracts.stable.address)
    })

    it('has the factory', async function () {
      expect(await this.contracts.engine.factory()).to.equal(this.contracts.factory.address)
    })
  })
})
