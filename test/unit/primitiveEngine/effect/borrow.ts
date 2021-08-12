import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { EngineBorrow, PrimitiveEngine } from '../../../../typechain'
import { computePoolId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, lastTimestamp, delta } = config
const { HashZero } = constants

export async function beforeEachBorrow(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('100000000').raw)

  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)

  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)

  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineSupply.address, parseWei('1000').raw, HashZero)
  await contracts.engineSupply.supply(poolId, parseWei('1000').raw)
}

describe('borrow', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply', 'engineBorrow'],
      beforeEachBorrow
    )
  })

  describe('when the parameters are valid', function () {
    let poolId: string, posId: string
    let deployer: Wallet, engine: PrimitiveEngine, engineBorrow: EngineBorrow
    let one = parseWei('1')

    beforeEach(async function () {
      ;[deployer, engine, engineBorrow] = [this.signers[0], this.contracts.engine, this.contracts.engineBorrow]
      poolId = computePoolId(engine.address, maturity.raw, sigma.raw, strike.raw)
      posId = await engineBorrow.getPosition(poolId)
    })

    describe('success cases', async function () {
      it('pos.borrow: increases position debt', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.increasePositionDebt(
          engine,
          posId,
          one.raw
        )
        expect(await engine.positions(posId)).to.be.deep.eq([parseWei('0').raw, parseWei('0').raw, one.raw])
      })
      it('res.borrowFloat: increases reserve debt', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.increaseReserveDebt(
          engine,
          poolId,
          one.raw
        )
      })

      it('res.borrowFloat: decreases reserve float', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.decreaseReserveFloat(
          engine,
          poolId,
          one.raw
        )
      })

      it('res.remove: decreases reserve liquidity', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.decreaseReserveLiquidity(
          engine,
          poolId,
          one.raw
        )
      })

      it('res.remove: decreases reserve risky', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.decreaseReserveRisky(
          engine,
          poolId,
          delRisky
        )
      })

      it('res.remove: decreases reserve stable', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.decreaseReserveStable(
          engine,
          poolId,
          delStable
        )
      })

      it('borrows using margin', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        const premium = one.raw.sub(delRisky)
        await this.contracts.engineDeposit.deposit(engineBorrow.address, premium, delStable, HashZero)
        await expect(engineBorrow.borrowWithMargin(poolId, engineBorrow.address, one.raw, HashZero)).to.decreaseMargin(
          engine,
          engineBorrow.address,
          premium,
          delStable.mul(-1)
        )
      })

      it('msg.sender recieves stable tokens from removed liquidity', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(() => engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.changeTokenBalances(
          this.contracts.stable,
          [this.signers[0]],
          [delStable]
        )
      })

      it('engine recieves risky token premium', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        const premium = one.raw.sub(delRisky)
        await expect(() => engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero)).to.changeTokenBalances(
          this.contracts.risky,
          [this.contracts.engine],
          [premium]
        )
      })

      it('repays a long option position, earning the proceeds', async function () {
        let riskyBal = await this.contracts.risky.balanceOf(deployer.address)
        await engineBorrow.borrow(poolId, engineBorrow.address, one.raw, HashZero) // spends premium
        let premium = riskyBal.sub(await this.contracts.risky.balanceOf(deployer.address))
        await expect(() =>
          engineBorrow.repay(poolId, engineBorrow.address, one.raw, false, HashZero)
        ).to.changeTokenBalances(this.contracts.risky, [deployer], [premium])
        expect(await engine.positions(posId)).to.be.deep.eq([parseWei('0').raw, parseWei('0').raw, parseWei('0').raw])
      })
    })

    describe('fail cases', async function () {
      it('reverts if borrow amount is 0', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('0').raw, HashZero)).to.be.reverted
      })
      it('fails to originate more long option positions than are allocated to float', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('2000').raw, HashZero)).to.be.reverted
      })
      it('fails to originate 1 long option, because no tokens were paid', async function () {
        await expect(engineBorrow.borrowWithoutPaying(poolId, engineBorrow.address, one.raw, HashZero)).to.be.reverted
      })

      it('fails to borrow from margin because not enough premium', async function () {
        await expect(engineBorrow.borrowWithMargin(poolId, engineBorrow.address, one.raw, HashZero)).to.be.reverted
      })
    })
  })
})
