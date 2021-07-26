import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { parseWei } from 'web3-units'

import { lendFragment } from '../fragments'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'

const { strike, sigma, maturity, spot } = config
let poolId, posId: string

describe('lend', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineLend'], lendFragment)
  })

  beforeEach(async function () {
    poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
    posId = await this.contracts.engineLend.getPosition(poolId)
  })

  describe('success cases', function () {
    it('adds 1 liquidity share to float', async function () {
      await this.contracts.engineLend.lend(poolId, parseWei('1').raw)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        parseWei('1').raw,
        parseWei('10').raw,
        BigNumber.from('0'),
      ])
    })
  })

  describe('fail cases', function () {
    it('fails to add 0 liquidity', async function () {
      await expect(this.contracts.engineLend.lend(poolId, parseWei('20').raw)).to.be.revertedWith('Not enough liquidity')
    })

    it('fails to add more to float than is available in the position liquidity', async function () {
      await expect(this.contracts.engineLend.lend(poolId, parseWei('20').raw)).to.be.reverted
    })
  })
})
