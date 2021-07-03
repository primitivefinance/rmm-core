import { expect } from 'chai'
import { BigNumber } from '../../../shared/sdk/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('owner', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })
  it('returns the deployer of the contract as the owner', async function () {
    expect(await this.contracts.engine.risky()).to.equal(this.contracts.risky.address)
  })
})
