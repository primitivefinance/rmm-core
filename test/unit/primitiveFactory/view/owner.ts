import { waffle } from 'hardhat'
import { expect } from 'chai'

import loadContext from '../../context'

describe('owner', async function () {
  before(async function () {
    loadContext(waffle.provider, [], async () => {})
  })

  it('returns the deployer of the contract as the owner', async function () {
    const [deployer] = this.signers

    expect(await this.contracts.factory.owner()).to.equal(deployer.address)
  })
})
