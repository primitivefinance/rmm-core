import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { parseWei } from 'web3-units'
import { constants, Wallet } from 'ethers'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, delta } = config
const { HashZero } = constants

export async function beforeEachSupply(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000000').raw)
  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineSupply.address, parseWei('10').raw, HashZero)
}

describe('claim', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply', 'engineBorrow'],
      beforeEachSupply
    )
  })

  let poolId, posId: string
  const one = parseWei('1')
  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    posId = await this.contracts.engineSupply.getPosition(poolId)
    await this.contracts.engineSupply.supply(poolId, one.raw)
  })

  describe('success cases', function () {
    it('res.removeFloat: removes 1 liquidity share from reserve float', async function () {
      await expect(this.contracts.engineSupply.claim(poolId, one.raw)).to.decreaseReserveFloat(
        this.contracts.engine,
        poolId,
        one.raw
      )
    })

    it('pos.claim: removes 1 liquidity share from position float', async function () {
      await expect(this.contracts.engineSupply.claim(poolId, one.raw)).to.decreasePositionFloat(
        this.contracts.engine,
        posId,
        one.raw
      )
    })
  })

  describe('fail cases', function () {
    it('fails to remove 0 liquidity', async function () {
      await expect(this.contracts.engineSupply.claim(poolId, parseWei('0').raw)).to.be.revertedWith('LiquidityError()')
    })

    it('fails to remove more to float than is available in the position liquidity', async function () {
      await expect(this.contracts.engineSupply.claim(poolId, parseWei('20').raw)).to.be.reverted
    })
    it('fails to remove more to float than is available in the __GLOBAL FLOAT__', async function () {
      await this.contracts.engineBorrow.borrow(poolId, this.contracts.engineBorrow.address, one.raw, '0', HashZero)
      await expect(this.contracts.engineSupply.claim(poolId, one.raw)).to.be.reverted
    })
  })
})
