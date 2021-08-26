import expect from '../../../shared/expect'
import { waffle } from 'hardhat'
import { parseWei, Time, toBN, Wei } from 'web3-units'
import { constants, Wallet } from 'ethers'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { Contracts } from '../../../../types'
import { computePoolId } from '../../../shared/utils'
import { Calibration } from '../../../shared'

const { strike, sigma, maturity, delta } = config
const { HashZero } = constants

export async function beforeEachRepay(signers: Wallet[], contracts: Contracts): Promise<void> {
  await contracts.stable.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.risky.mint(signers[0].address, parseWei('100000000').raw)
  await contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, parseWei(delta).raw, parseWei('1').raw, HashZero)
  const poolId = computePoolId(contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
  const initLiquidity = parseWei('100')
  await contracts.engineAllocate.allocateFromExternal(poolId, contracts.engineSupply.address, initLiquidity.raw, HashZero)
  await contracts.engineSupply.supply(poolId, initLiquidity.mul(8).div(10).raw)
  await contracts.engineRepay.borrow(poolId, contracts.engineRepay.address, parseWei('1').raw, strike.raw, HashZero)
}

describe('repay', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply', 'engineRepay', 'engineBorrow'],
      beforeEachRepay
    )
  })

  let poolId: string, posId: string
  let riskyCollateral: Wei, stableCollateral: Wei, delLiquidity: Wei
  const one = parseWei('1')

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
    posId = await this.contracts.engineRepay.getPosition(poolId)
    riskyCollateral = one
    stableCollateral = strike
    delLiquidity = riskyCollateral.add(stableCollateral.mul(1e18).div(strike))
  })

  describe('success cases', function () {
    it('reduces the riskyCollateral of the position', async function () {
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', false, HashZero)
      ).to.decreasePositionDebt(this.contracts.engine, posId, one.raw, toBN(0))
      const position = await this.contracts.engine.positions(posId)
      expect(position.riskyCollateral).to.equal(0)
    })

    it('reduces the stableCollateral of the position', async function () {
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, '0', strike.raw, false, HashZero)
      ).to.decreasePositionDebt(this.contracts.engine, posId, toBN(0), strike.raw)
      const position = await this.contracts.engine.positions(posId)
      expect(position.stableCollateral).to.equal(0)
    })

    it('res.allocate: increases risky reserve', async function () {
      const res = await this.contracts.engine.reserves(poolId)
      const delRisky = delLiquidity.mul(res.reserveRisky).div(res.liquidity)
      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveRisky(this.contracts.engine, poolId, delRisky.raw)
    })

    it('res.allocate: increases stable reserve', async function () {
      const res = await this.contracts.engine.reserves(poolId)
      const delStable = delLiquidity.mul(res.reserveStable).div(res.liquidity)
      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveStable(this.contracts.engine, poolId, delStable.raw)
    })

    it('res.allocate: increases reserve liquidity', async function () {
      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)
    })

    it('res.allocate: updates reserve blocktimestamp', async function () {
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', false, HashZero)
      ).to.updateReserveBlockTimestamp(this.contracts.engine, poolId, +(await this.contracts.engine.time()))
    })

    it('allocates to the reserve and updates all its values', async function () {
      const oldReserve = await this.contracts.engine.reserves(poolId)
      const delRisky = delLiquidity.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
      const delStable = delLiquidity.mul(oldReserve.reserveStable).div(oldReserve.liquidity)

      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveLiquidity(this.contracts.engine, poolId, delLiquidity.raw)

      const newReserve = await this.contracts.engine.reserves(poolId)

      expect(newReserve.reserveRisky).to.equal(oldReserve.reserveRisky.add(delRisky.raw))
      expect(newReserve.reserveStable).to.equal(oldReserve.reserveStable.add(delStable.raw))
      expect(newReserve.liquidity).to.equal(oldReserve.liquidity.add(delLiquidity.raw))
    })

    it('res.repayFloat: decreases reserve debt', async function () {
      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.decreaseReserveDebt(this.contracts.engine, poolId, delLiquidity.raw)
    })

    it('res.repayFloat: increases reserve float', async function () {
      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveFloat(this.contracts.engine, poolId, delLiquidity.raw)
    })

    it('reduces the debt and increases the float of the reserve', async function () {
      const oldReserve = await this.contracts.engine.reserves(poolId)

      await expect(
        this.contracts.engineRepay.repay(
          poolId,
          this.contracts.engineRepay.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          false,
          HashZero
        )
      ).to.increaseReserveFloat(this.contracts.engine, poolId, delLiquidity.raw)

      const newReserve = await this.contracts.engine.reserves(poolId)
      expect(newReserve.float).to.equal(oldReserve.float.add(delLiquidity.raw))
      expect(newReserve.debt).to.equal(oldReserve.debt.sub(delLiquidity.raw))
    })

    it('emits the Repaid event', async function () {
      const res = await this.contracts.engine.reserves(poolId)
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', false, HashZero)
      )
        .to.emit(this.contracts.engine, 'Repaid')
        .withArgs(
          this.contracts.engineRepay.address,
          this.contracts.engineRepay.address,
          poolId,
          '0',
          one.mul(res.reserveStable).div(res.liquidity).raw
        )
    })

    describe('when from margin', function () {
      it('reduces stable in margin by delStable, increases risky in margin by premium', async function () {
        await this.contracts.engineDeposit.deposit(this.contracts.engineRepay.address, 0, parseWei('400').raw, HashZero)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        const delRisky = one.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const delStable = one.mul(oldReserve.reserveStable).div(oldReserve.liquidity)
        const premium = one.sub(delRisky)
        const margin = await this.contracts.engine.margins(this.contracts.engineRepay.address)

        await expect(
          this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', true, HashZero)
        ).to.decreaseMargin(this.contracts.engine, this.contracts.engineRepay.address, premium.raw.mul(-1), delStable.raw)

        const newMargin = await this.contracts.engine.margins(this.contracts.engineRepay.address)

        expect(newMargin.balanceStable).to.equal(margin.balanceStable.sub(delStable.raw))
        expect(newMargin.balanceRisky).to.equal(margin.balanceRisky.add(premium.raw))
      })
    })

    describe('when from external', function () {
      it('transfers the risky surplus to the caller of repay', async function () {
        const previousRiskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        // div delLiquidity by 2 because we are only liquidating 1 riskyCollateral = 1 unit of debt
        const delRisky = delLiquidity.div(2).mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const riskySurplus = riskyCollateral.sub(delRisky)

        await expect(() =>
          this.contracts.engineRepay.repay(
            poolId,
            this.contracts.engineRepay.address,
            riskyCollateral.raw,
            '0',
            false,
            HashZero
          )
        ).to.changeTokenBalances(this.contracts.risky, [this.signers[0]], [riskySurplus.raw])

        expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(
          previousRiskyBalance.add(riskySurplus.raw)
        )
      })

      it('transfers the stable deficit from the caller to the engine', async function () {
        const signerPreviousStableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)
        const enginePreviousStableBalance = await this.contracts.stable.balanceOf(this.contracts.engine.address)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        // div delLiquidity by 2 because we are only liquidating 1 riskyCollateral = 1 unit of debt
        const delStable = delLiquidity.div(2).mul(oldReserve.reserveStable).div(oldReserve.liquidity)
        const stableDeficit = delStable

        await expect(() =>
          this.contracts.engineRepay.repay(
            poolId,
            this.contracts.engineRepay.address,
            riskyCollateral.raw,
            '0',
            false,
            HashZero
          )
        ).to.changeTokenBalances(this.contracts.stable, [this.contracts.engine], [stableDeficit.raw])

        expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(
          signerPreviousStableBalance.sub(stableDeficit.raw)
        )

        expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.equal(
          enginePreviousStableBalance.add(stableDeficit.raw)
        )
      })
    })

    describe('when expired', function () {
      let expiredPoolId: string
      beforeEach(async function () {
        const fig = new Calibration(10, 1, Time.YearInSeconds, Time.YearInSeconds + 1, 10)
        await this.contracts.engineCreate.create(
          fig.strike.raw,
          fig.sigma.raw,
          fig.maturity.raw,
          parseWei(fig.delta).raw,
          one.raw,
          HashZero
        )
        expiredPoolId = computePoolId(this.contracts.engine.address, fig.maturity.raw, fig.sigma.raw, fig.strike.raw)
        await this.contracts.engine.advanceTime(Time.YearInSeconds + 1)
        // give liquidity to engineSupply contract
        await this.contracts.engineAllocate.allocateFromExternal(
          expiredPoolId,
          this.contracts.engineSupply.address,
          parseWei('100').raw,
          HashZero
        )
        // have the engineSupply contract supply the lp shares
        await this.contracts.engineSupply.supply(expiredPoolId, parseWei('100').mul(8).div(10).raw)
        // have the engineBorrow borrow the lp shares
        await this.contracts.engineBorrow.borrow(
          expiredPoolId,
          this.contracts.engineBorrow.address,
          riskyCollateral.raw,
          stableCollateral.raw,
          HashZero
        )
      })

      it('repay engineBorrow`s riskyCollateral position, receive riskySurplus and pay stable deficit', async function () {
        const oldReserve = await this.contracts.engine.reserves(expiredPoolId)
        const delRisky = delLiquidity.mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const delStable = delLiquidity.mul(oldReserve.reserveStable).div(oldReserve.liquidity)

        let riskyDeficit = parseWei(0)
        let riskySurplus = parseWei(0)
        let stableDeficit = parseWei(0)
        let stableSurplus = parseWei(0)

        if (riskyCollateral.gt(delRisky)) riskySurplus = riskyCollateral.sub(delRisky)
        else riskyDeficit = delRisky.sub(riskyCollateral)
        if (riskyCollateral.gt(delRisky)) stableSurplus = stableCollateral.sub(delStable)
        else stableDeficit = delStable.sub(stableCollateral)

        await this.contracts.engineDeposit.deposit(this.contracts.engineRepay.address, 0, stableDeficit.raw, HashZero)
        await expect(
          this.contracts.engineRepay.repay(
            expiredPoolId,
            this.contracts.engineBorrow.address,
            riskyCollateral.raw,
            stableCollateral.raw,
            true,
            HashZero
          )
        ).to.decreaseMargin(
          this.contracts.engine,
          this.contracts.engineRepay.address,
          riskySurplus.mul(-1).add(riskyDeficit).raw,
          stableSurplus.mul(-1).add(stableDeficit).raw
        )
      })
    })
  })

  describe('fail cases', function () {
    it('reverts if no debt', async function () {
      await this.contracts.engineRepay.repay(
        poolId,
        this.contracts.engineRepay.address,
        riskyCollateral.raw,
        stableCollateral.raw,
        false,
        HashZero
      )
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', false, HashZero)
      ).to.be.reverted
    })

    it('reverts if repaying another account before maturity', async function () {
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.signers[0].address,
        parseWei('100').raw,
        HashZero
      )
      await this.contracts.engine.supply(poolId, parseWei('100').mul(8).div(10).raw)
      await this.contracts.engineRepay.borrow(poolId, this.contracts.engineRepay.address, one.raw, '0', HashZero)
      await this.contracts.engineDeposit.deposit(this.signers[0].address, parseWei('100').raw, parseWei('100').raw, HashZero)
      await expect(this.contracts.engine.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', true, HashZero)).to
        .be.reverted
    })

    describe('when from margin', function () {
      it('reverts if the stable balance of the margin is not sufficient', async function () {
        await expect(
          this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, one.raw, '0', true, HashZero)
        ).to.be.reverted
      })
    })

    describe('when from external', function () {
      it('reverts if stable was not paid in callback', async function () {
        await expect(
          this.contracts.engineRepay.repayWithoutRepaying(
            poolId,
            this.contracts.engineRepay.address,
            one.raw,
            '0',
            false,
            HashZero
          )
        ).to.be.reverted
      })
    })
  })
})
