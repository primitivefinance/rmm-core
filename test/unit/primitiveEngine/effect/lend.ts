import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'

import { parseWei } from 'web3-units'

import { lendFragment } from '../fragments'

import loadContext, { config } from '../../context'

const { strike, sigma, maturity, spot } = config

describe('lend', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineLend'], lendFragment)
  })

  describe('when the parameters are valid', function () {
    it('adds 1 liquidity share to float', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
      const posid = await this.contracts.engineLend.getPosition(poolId)
      await this.contracts.engineLend.lend(poolId, parseWei('1').raw)

      expect(await this.contracts.engine.positions(posid)).to.be.deep.eq([
        parseWei('1').raw,
        parseWei('10').raw,
        BigNumber.from('0'),
      ])
    })

    it('fails to add more to float than is available in the position liquidity', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
      await expect(this.contracts.engineLend.lend(poolId, parseWei('20').raw)).to.be.reverted
    })
  })
})
