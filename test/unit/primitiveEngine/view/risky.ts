import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('owner', function () {
  before(async function () {
    loadContext(waffle.provider, [])
  })

  it('returns the deployer of the contract as the owner', async function () {
    expect(await this.contracts.engine.risky()).to.equal(this.contracts.risky.address)
  })
})
