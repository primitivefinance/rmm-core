import { expect } from 'chai'
import { BigNumber } from '../../../shared/Units'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('getAllPoolsLength', function () {
  beforeEach(async function () {
    await loadContext(waffle.provider, [], async function () {})
  })

  it('returns 0 when no pools have been created', async function () {
    expect(await this.contracts.engine.getAllPoolsLength()).to.deep.equal(BigNumber.from(0))
  })
})
