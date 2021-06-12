import { expect } from 'chai'
import { BigNumber } from '../../../shared/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('fee', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })

  it('returns the swap fee', async function () {
    expect(await this.contracts.engine.fee()).to.equal('30')
  })
})
