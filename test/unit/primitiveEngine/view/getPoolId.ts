import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('getPoolId', function () {
  before(async function () {
    loadContext(waffle.provider, [], async function () {})
  })

  it('returns the poolId given settings', async function () {
    expect(
      await this.contracts.engine.getPoolId(
        utils.parseEther('2000'),
        utils.parseEther('1'),
        1626885358,
      )
    ).to.equal('0x6093cfe2dcd31f99fc9c000b2a4131da40c5edf520b07056908a5618fd958602')
  })
})
