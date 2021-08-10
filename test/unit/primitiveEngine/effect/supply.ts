import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { parseWei } from 'web3-units'

import { supplyFragment } from '../fragments'
import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId } from '../../../shared/utils'

const { strike, sigma, maturity } = config
let poolId, posId: string

describe('supply', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply'], supplyFragment)
  })

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    posId = await this.contracts.engineSupply.getPosition(poolId)
  })

  describe('success cases', function () {
    it('adds 1 liquidity share to float', async function () {
      await this.contracts.engineSupply.supply(poolId, parseWei('1').raw)

      expect(await this.contracts.engine.positions(posId)).to.be.deep.eq([
        parseWei('1').raw,
        parseWei('10').raw,
        BigNumber.from('0'),
      ])
    })
  })

  describe('fail cases', function () {
    it('fails to add 0 liquidity', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, parseWei('20').raw)).to.be.revertedWith('LiquidityError()')
    })

    it('fails to add more to float than is available in the position liquidity', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, parseWei('20').raw)).to.be.reverted
    })
  })
})
