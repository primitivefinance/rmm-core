import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { parseWei, toBN } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { EngineBorrow, PrimitiveEngine } from '../../../../typechain'
import { computePoolId, computePositionId } from '../../../shared/utils'
import { Contracts } from '../../../../types'

const { strike, sigma, maturity, lastTimestamp, delta } = config
const { HashZero } = constants

export async function beforeEachBorrow(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('100000000').raw)

  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)

  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  const initLiquidity = parseWei('1000')
  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineSupply.address, initLiquidity.raw, HashZero)
  await contracts.engineSupply.supply(poolId, initLiquidity.mul(8).div(10).raw)
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
      it('pos.borrow: increases position riskyCollateral', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.increasePositionDebt(
          engine,
          posId,
          one.raw,
          toBN('0')
        )
        expect(await engine.positions(posId)).to.be.deep.eq([toBN(0), toBN(0), one.raw, toBN('0')])
      })

      it('pos.borrow: increases position stableCollateral', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, '0', strike.raw, HashZero)).to.increasePositionDebt(
          engine,
          posId,
          toBN('0'),
          strike.raw
        )
        expect(await engine.positions(posId)).to.be.deep.eq([toBN(0), toBN(0), toBN('0'), strike.raw])
      })

      it('pos.borrow: increases position risky & stable collateral', async function () {
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, one.raw, strike.raw, HashZero)
        ).to.increasePositionDebt(engine, posId, one.raw, strike.raw)
        expect(await engine.positions(posId)).to.be.deep.eq([toBN(0), toBN(0), one.raw, strike.raw])
      })

      it('res.borrowFloat: increases reserve debt', async function () {
        const riskyCollateral = one
        const stableCollateral = strike
        const delLiquidity = riskyCollateral.add(stableCollateral.mul(1e18).div(strike))
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, riskyCollateral.raw, stableCollateral.raw, HashZero)
        ).to.increaseReserveDebt(engine, poolId, delLiquidity.raw)
      })

      it('res.borrowFloat: decreases reserve float', async function () {
        const riskyCollateral = one
        const stableCollateral = strike
        const delLiquidity = riskyCollateral.add(stableCollateral.mul(1e18).div(strike))
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, riskyCollateral.raw, stableCollateral.raw, HashZero)
        ).to.decreaseReserveFloat(engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve liquidity', async function () {
        const riskyCollateral = one
        const stableCollateral = strike
        const delLiquidity = riskyCollateral.add(stableCollateral.mul(1e18).div(strike))
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, riskyCollateral.raw, stableCollateral.raw, HashZero)
        ).to.decreaseReserveLiquidity(engine, poolId, delLiquidity.raw)
      })

      it('res.remove: decreases reserve risky from riskyCollateral', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.decreaseReserveRisky(
          engine,
          poolId,
          delRisky
        )
      })

      it('res.remove: decreases reserve stable from riskyCollateral', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.decreaseReserveStable(
          engine,
          poolId,
          delStable
        )
      })

      it('res.remove: decreases reserve risky from stableCollateral', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const stableCollateral = strike
        const delLiquidity = stableCollateral.mul(1e18).div(strike)
        const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity).raw
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, '0', stableCollateral.raw, HashZero)
        ).to.decreaseReserveRisky(engine, poolId, delRisky)
      })

      it('res.remove: decreases reserve stable from stableCollateral', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const stableCollateral = strike
        const delLiquidity = stableCollateral.mul(1e18).div(strike)
        const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity).raw
        await expect(
          engineBorrow.borrow(poolId, engineBorrow.address, '0', stableCollateral.raw, HashZero)
        ).to.decreaseReserveStable(engine, poolId, delStable)
      })

      describe('from margin', function () {
        it('borrows riskyCollateral using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const riskyDeficit = one
            .sub(delRisky)
            .mul(1e4 + 30)
            .div(1e4).raw
          await this.contracts.engineDeposit.deposit(
            engineBorrow.address,
            riskyDeficit.mul(1e4 + 30).div(1e4),
            delStable.div(1e4),
            HashZero
          )
          await expect(
            engineBorrow.borrowWithMargin(poolId, engineBorrow.address, one.raw, '0', HashZero)
          ).to.decreaseMargin(engine, engineBorrow.address, riskyDeficit, delStable.mul(-1))
        })

        it('borrows stableCollateral using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = one.mul(res.reserveStable).div(res.liquidity).raw
          const stableDeficit = strike
            .sub(delStable)
            .mul(1e4 + 30)
            .div(1e4).raw
          await this.contracts.engineDeposit.deposit(
            engineBorrow.address,
            delRisky,
            stableDeficit.mul(1e4 + 30).div(1e4),
            HashZero
          )
          await expect(
            engineBorrow.borrowWithMargin(poolId, engineBorrow.address, '0', strike.raw, HashZero)
          ).to.decreaseMargin(engine, engineBorrow.address, delRisky.mul(-1), stableDeficit)
        })

        it('borrows risky & stable collateral using margin', async function () {
          const res = await this.contracts.engine.reserves(poolId)
          const delLiquidity = one.add(strike.mul(1e18).div(strike))
          const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity).raw
          const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity).raw
          const riskyDeficit = one
            .sub(delRisky)
            .mul(1e4 + 30)
            .div(1e4)
          const stableDeficit = strike
            .sub(delStable)
            .mul(1e4 + 30)
            .div(1e4)

          await this.contracts.engineDeposit.deposit(engineBorrow.address, riskyDeficit.raw, stableDeficit.raw, HashZero)

          await expect(
            engineBorrow.borrowWithMargin(poolId, engineBorrow.address, one.raw, strike.raw, HashZero)
          ).to.decreaseMargin(engine, engineBorrow.address, riskyDeficit.raw, stableDeficit.raw)
        })
      })

      it('msg.sender receives stable tokens from removed liquidity', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        await expect(() => engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.changeTokenBalances(
          this.contracts.stable,
          [this.signers[0]],
          [delStable]
        )
      })

      it('msg.sender receives risky tokens from removed liquidity', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        await expect(() =>
          engineBorrow.borrow(poolId, engineBorrow.address, '0', strike.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [delRisky])
      })

      it('engine receives risky token surplus', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.raw.mul(res.reserveRisky).div(res.liquidity)
        const riskySurplus = one
          .sub(delRisky)
          .mul(1e4 + 30)
          .div(1e4).raw
        await expect(() => engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.changeTokenBalances(
          this.contracts.risky,
          [this.contracts.engine],
          [riskySurplus]
        )
      })

      it('engine receives stable token surplus', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delStable = one.raw.mul(res.reserveStable).div(res.liquidity)
        const stableSurplus = strike
          .sub(delStable)
          .mul(1e4 + 30)
          .div(1e4).raw
        await expect(() =>
          engineBorrow.borrow(poolId, engineBorrow.address, '0', strike.raw, HashZero)
        ).to.changeTokenBalances(this.contracts.stable, [this.contracts.engine], [stableSurplus])
      })

      describe('borrows then repays, losing the fee paid in borrow', function () {
        it('repays a long option position with risky collateral, earning the proceeds', async function () {
          await engineBorrow.borrow(poolId, engineBorrow.address, one.raw, '0', HashZero) // spends premium
          const res = await this.contracts.engine.reserves(poolId)
          const delRisky = one.mul(res.reserveRisky).div(res.liquidity)
          const riskyDeficit = one.sub(delRisky)

          await expect(() =>
            engineBorrow.repay(poolId, engineBorrow.address, one.raw, '0', false, HashZero)
          ).to.changeTokenBalances(this.contracts.risky, [deployer], [riskyDeficit.raw])
          expect(await engine.positions(posId)).to.be.deep.eq([toBN(0), toBN(0), toBN(0), toBN(0)])
        })

        it('repays a long option position with stable collateral, earning the proceeds', async function () {
          const stableCollateral = strike
          await engineBorrow.borrow(poolId, engineBorrow.address, '0', stableCollateral.raw, HashZero) // spends premium
          const res = await this.contracts.engine.reserves(poolId)
          const delStable = one.mul(res.reserveStable).div(res.liquidity)
          const stableDeficit = stableCollateral.sub(delStable)

          await expect(() =>
            engineBorrow.repay(poolId, engineBorrow.address, '0', stableCollateral.raw, false, HashZero)
          ).to.changeTokenBalances(this.contracts.stable, [deployer], [stableDeficit.raw])
          expect(await engine.positions(posId)).to.be.deep.eq([toBN(0), toBN(0), toBN(0), toBN(0)])
        })
      })

      it('emits the Borrowed event', async function () {
        const res = await this.contracts.engine.reserves(poolId)
        const delRisky = one.mul(res.reserveRisky).div(res.liquidity)
        const delStable = one.mul(res.reserveStable).div(res.liquidity)
        await expect(this.contracts.engineBorrow.borrow(poolId, this.contracts.engineBorrow.address, one.raw, '0', HashZero))
          .to.emit(this.contracts.engine, 'Borrowed')
          .withArgs(
            this.contracts.engineBorrow.address,
            poolId,
            one.raw,
            '0',
            one
              .sub(delRisky)
              .mul(1e4 + 30)
              .div(1e4).raw, // riskyDeficit
            '0', // riskySurplus
            '0', // stableDeficit
            delStable.raw // stableSurplus
          )
      })
    })

    describe('fail cases', async function () {
      it('reverts if both risky & stable collateral amounts are 0', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, toBN(0), toBN(0), HashZero)).to.be.reverted
      })
      it('fails to originate more long option positions than are allocated to float', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('2000').raw, toBN(0), HashZero)).to.be
          .reverted
      })

      it('fails to originate 1 long option, because no tokens were paid for risky deficit', async function () {
        await expect(engineBorrow.borrowWithoutPaying(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.be.reverted
      })

      it('fails to originate 1 long option, because no tokens were paid for stable deficit', async function () {
        await expect(engineBorrow.borrowWithoutPaying(poolId, engineBorrow.address, '0', strike.raw, HashZero)).to.be
          .reverted
      })

      it('fails to borrow from margin because not enough risky in margin', async function () {
        await expect(engineBorrow.borrowWithMargin(poolId, engineBorrow.address, one.raw, '0', HashZero)).to.be.reverted
      })

      it('fails to borrow from margin because not enough stable in margin', async function () {
        await expect(engineBorrow.borrowWithMargin(poolId, engineBorrow.address, '0', strike.raw, HashZero)).to.be.reverted
      })
    })
  })
})
