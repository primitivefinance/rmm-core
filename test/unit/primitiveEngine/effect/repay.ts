import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BytesLike, constants } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { repayFragment } from '../fragments'
import { computePoolId } from '../../utils'

let poolId: BytesLike
let posId: BytesLike

const { strike, sigma, maturity, lastTimestamp, spot } = config
const empty: BytesLike = constants.HashZero

describe('repay', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineLend', 'engineRepay'],
      repayFragment
    )
  })

  beforeEach(async function () {
    poolId = computePoolId(this.contracts.factory.address, maturity.raw, sigma.raw, strike.raw)
    posId = await this.contracts.engineRepay.getPosition(poolId)
  })

  describe('success cases', function () {
    beforeEach(async function () {
      await this.contracts.engineRepay.borrow(poolId, this.contracts.engineRepay.address, parseWei('1').raw, empty)
    })

    it('reduces the debt of the position', async function () {
      await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)
      const position = await this.contracts.engine.positions(posId)
      expect(position.debt).to.equal(0)
    })

    it('allocates to the reserve', async function () {
      const oldReserve = await this.contracts.engine.reserves(poolId)
      const delRisky = parseWei('1').mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
      const delStable = parseWei('1').mul(oldReserve.reserveStable).div(oldReserve.liquidity)

      await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)

      const newReserve = await this.contracts.engine.reserves(poolId)

      expect(newReserve.reserveRisky).to.equal(oldReserve.reserveRisky.add(delRisky.raw))
      expect(newReserve.reserveStable).to.equal(oldReserve.reserveStable.add(delStable.raw))
      expect(newReserve.liquidity).to.equal(oldReserve.liquidity.add(parseWei('1').raw))
    })

    it('reduces the debt and increases the float of the reserve', async function () {
      const oldReserve = await this.contracts.engine.reserves(poolId)

      await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)

      const newReserve = await this.contracts.engine.reserves(poolId)
      expect(newReserve.float).to.equal(oldReserve.float.add(parseWei('1').raw))
      expect(newReserve.debt).to.equal(oldReserve.debt.sub(parseWei('1').raw))
    })

    it('emits the Repaid event', async function () {
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)
      )
        .to.emit(this.contracts.engine, 'Repaid')
        .withArgs(this.contracts.engineRepay.address, poolId, parseWei('1').raw)
    })

    describe('when from margin', function () {
      it('reduces the delStable margin of the caller', async function () {
        await this.contracts.engineDeposit.deposit(this.contracts.engineRepay.address, 0, parseWei('400').raw, empty)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        const delRisky = parseWei('1').mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const delStable = parseWei('1').mul(oldReserve.reserveStable).div(oldReserve.liquidity)
        const premium = parseWei('1').sub(delRisky)
        const margin = await this.contracts.engine.margins(this.contracts.engineRepay.address)

        await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, true, empty)

        const newMargin = await this.contracts.engine.margins(this.contracts.engineRepay.address)

        expect(newMargin.balanceStable).to.equal(margin.balanceStable.sub(delStable.raw))
        expect(newMargin.balanceRisky).to.equal(margin.balanceRisky.add(premium.raw))
      })
    })

    describe('when from external', function () {
      it("transfers the premium to the caller's wallet", async function () {
        const previousRiskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        const delRisky = parseWei('1').mul(oldReserve.reserveRisky).div(oldReserve.liquidity)
        const premium = parseWei('1').sub(delRisky)

        await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)

        expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(previousRiskyBalance.add(premium.raw))
      })

      it('transfers the stable from the callers wallet to the engine', async function () {
        const signerPreviousStableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)
        const enginePreviousStableBalance = await this.contracts.stable.balanceOf(this.contracts.engine.address)

        const oldReserve = await this.contracts.engine.reserves(poolId)
        const delStable = parseWei('1').mul(oldReserve.reserveStable).div(oldReserve.liquidity)

        await this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)

        expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(
          signerPreviousStableBalance.sub(delStable.raw)
        )

        expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.equal(
          enginePreviousStableBalance.add(delStable.raw)
        )
      })
    })
  })

  describe('fail cases', function () {
    it('reverts if no debt', async function () {
      await expect(
        this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, false, empty)
      ).to.be.reverted
    })

    describe('when from margin', function () {
      it('reverts if the stable balance of the margin is not sufficient', async function () {
        await expect(
          this.contracts.engineRepay.repay(poolId, this.contracts.engineRepay.address, parseWei('1').raw, true, empty)
        ).to.be.reverted
      })

      it('reverts if the stable is not sent to repay', async function () {
        await expect(
          this.contracts.engineRepay.repayWithoutRepaying(
            poolId,
            this.contracts.engineRepay.address,
            parseWei('1').raw,
            false,
            empty
          )
        ).to.be.reverted
      })
    })
  })
})
