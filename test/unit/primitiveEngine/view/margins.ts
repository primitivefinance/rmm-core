import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('margins', function () {
  before(async function () {
    loadContext(waffle.provider, [], async function () {})
  })

  it('returns 0 for all fields when the margin account is uninitialized', async function () {
    expect(await this.contracts.engine.margins('0x882efb9e67eda9bf74766e8686259cb3a1fc8b8a')).to.deep.equal([
      BigNumber.from(0),
      BigNumber.from(0),
    ])
  })
})
