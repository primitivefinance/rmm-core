import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, Wallet } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, lastTimestamp, delta } = config
const empty = constants.HashZero

export async function beforeEachSupply(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000000').raw)

  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, empty)

  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineSupply.address, parseWei('10').raw, empty)
}

describe('supply', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply'], beforeEachSupply)
  })

  let poolId, posId: string
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
