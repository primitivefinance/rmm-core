import { expect } from 'chai'
import { utils } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'

describe('getPoolId', function () {
  before(async function () {
    loadContext(waffle.provider, [], async function () {})
  })

  it('returns the poolId given settings', async function () {
    const poolId = utils.keccak256(
      utils.solidityPack(
        ['address', 'uint32', 'uint64', 'uint256'],
        [this.contracts.factory.address, 1626885358, utils.parseEther('1'), utils.parseEther('2000')]
      )
    )

    expect(await this.contracts.engine.getPoolId(utils.parseEther('2000'), utils.parseEther('1'), 1626885358)).to.equal(
      poolId
    )
  })
})
