import { waffle } from 'hardhat'
import { constants, BytesLike, Wallet } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { computePoolId } from '../../../shared/utils'
import expect from '../../../shared/expect'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, spot, delta } = config
const { HashZero } = constants

export async function beforeEachReentrancy(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('10000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('10000').raw)
}

describe('reentrancy', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['reentrancyAttacker', 'engineCreate', 'engineAllocate', 'engineSupply', 'engineBorrow'],
      beforeEachReentrancy
    )
  })

  const delLiquidity = parseWei(1)
  let poolId: string
  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  })

  describe('when calling deposit in the deposit callback', function () {
    beforeEach(async function () {
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        HashZero
      )
    })

    it('reverts the transaction', async function () {
      await expect(
        this.contracts.reentrancyAttacker.deposit(this.signers[0].address, parseWei('1').raw, parseWei('1').raw, HashZero)
      ).to.be.reverted
    })
  })

  describe('when calling allocate in the allocate callback', function () {
    beforeEach(async function () {
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        HashZero
      )
    })

    it('reverts the transaction', async function () {
      await expect(this.contracts.reentrancyAttacker.allocate(poolId, this.signers[0].address, parseWei('1').raw, HashZero))
        .to.be.reverted
    })
  })

  describe('when calling borrow in the borrow callback', function () {
    beforeEach(async function () {
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        HashZero
      )
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.contracts.engineSupply.address,
        parseWei('100').raw,
        HashZero
      )
      await this.contracts.engineSupply.supply(poolId, parseWei('100').raw)
    })

    it('reverts the transaction', async function () {
      await expect(this.contracts.reentrancyAttacker.borrow(poolId, this.signers[0].address, parseWei('1').raw, HashZero)).to
        .be.reverted
    })
  })

  describe('when calling repay in the repay callback', function () {
    beforeEach(async function () {
      await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        parseWei(delta).raw,
        delLiquidity.raw,
        HashZero
      )
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.contracts.engineSupply.address,
        parseWei('100').raw,
        HashZero
      )
      await this.contracts.engineSupply.supply(poolId, parseWei('100').raw)
      await this.contracts.reentrancyAttacker.borrowWithGoodCallback(
        poolId,
        this.contracts.reentrancyAttacker.address,
        parseWei('1').raw,
        HashZero
      )
    })

    it('reverts the transaction', async function () {
      await expect(
        this.contracts.reentrancyAttacker.repay(
          poolId,
          this.contracts.reentrancyAttacker.address,
          parseWei('1').raw,
          false,
          HashZero
        )
      ).to.be.reverted
    })
  })
})
