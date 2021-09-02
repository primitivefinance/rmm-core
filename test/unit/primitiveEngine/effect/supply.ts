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

describe('supply', function () {
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
  })

  describe('success cases', function () {
    it('res.addFloat: adds 1 liquidity share to reserve float', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, one.raw)).to.increaseReserveFloat(
        this.contracts.engine,
        poolId,
        one.raw
      )
    })

    it('pos.supply: adds 1 liquidity share to position float', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, one.raw)).to.increasePositionFloat(
        this.contracts.engine,
        posId,
        one.raw
      )
    })

    describe('supply after borrow revenue', function () {
      it('pos.supply: adds 1 liquidity after borrow fee risky revenue has accrued', async function () {
        // supply first
        await this.contracts.engineSupply.supply(poolId, parseWei('2').raw)
        // calculate the expected borrow fees
        const res = await this.contracts.engine.reserves(poolId)
        const delLiquidity = one
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
        const riskyDeficit = delLiquidity.sub(delRisky)
        const fee = riskyDeficit.mul(30).div(1e4)
        const feeRiskyGrowth = fee.mul(one).div(res.float)
        // borrow the position, generating revenue
        await this.contracts.engineBorrow.borrow(poolId, this.contracts.engineSupply.address, one.raw, '0', HashZero)
        // repay the position to release the float
        await this.contracts.engineBorrow.repay(poolId, this.contracts.engineSupply.address, one.raw, '0', false, HashZero)
        // claim the float back, withdrawing the generated borrow fees
        await expect(this.contracts.engineSupply.supply(poolId, one.raw)).to.increasePositionFeeRiskyGrowthLast(
          this.contracts.engine,
          posId,
          feeRiskyGrowth.raw
        )
      })

      it('pos.supply: adds 1 liquidity after borrow fee stable revenue has accrued', async function () {
        // supply first
        await this.contracts.engineSupply.supply(poolId, parseWei('2').raw)
        // calculate the expected borrow fees
        const res = await this.contracts.engine.reserves(poolId)
        const stableCollateral = strike
        const delLiquidity = stableCollateral.mul(one).div(strike)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
        const stableDeficit = stableCollateral.sub(delStable)
        const fee = stableDeficit.mul(30).div(1e4)
        const feeStableGrowth = fee.mul(one).div(res.float)
        // borrow the position, generating revenue
        await this.contracts.engineBorrow.borrow(
          poolId,
          this.contracts.engineSupply.address,
          '0',
          stableCollateral.raw,
          HashZero
        )
        // repay the position to release the float
        await this.contracts.engineBorrow.repay(
          poolId,
          this.contracts.engineSupply.address,
          '0',
          stableCollateral.raw,
          false,
          HashZero
        )
        // claim the float back, withdrawing the generated borrow fees
        await expect(this.contracts.engineSupply.supply(poolId, one.raw)).to.increasePositionFeeStableGrowthLast(
          this.contracts.engine,
          posId,
          feeStableGrowth.raw
        )
      })
    })
  })

  describe('fail cases', function () {
    it('fails to add 0 liquidity', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, parseWei('0').raw)).to.be.revertedWith('LiquidityError()')
    })

    it('fails to add more to float than is available in the position liquidity', async function () {
      await expect(this.contracts.engineSupply.supply(poolId, parseWei('20').raw)).to.be.reverted
    })

    it('fails to remove liquidity after supplying it to float', async function () {
      let pos = await this.contracts.engine.positions(posId)
      const amt = pos.liquidity.mul(8).div(10)
      await this.contracts.engineSupply.supply(poolId, amt)
      await expect(this.contracts.engineSupply.remove(poolId, amt, HashZero)).to.be.reverted
    })

    it('fails to add liquidity to float above liquidity factor of 80%', async function () {
      let pos = await this.contracts.engine.positions(posId)
      await expect(this.contracts.engineSupply.supply(poolId, pos.liquidity)).to.be.revertedWith('LiquidityError()')
    })
  })
})
