import { ethers } from 'hardhat'
import { parseWei } from 'web3-units'
import { constants, Wallet } from 'ethers'

import expect from '../../../shared/expect'
import { testContext } from '../../../shared/testContext'
import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { engineFixture } from '../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../../shared/hooks'
import { createFixtureLoader } from 'ethereum-waffle'

TestPools.forEach(function (pool: PoolState) {
  testContext(`withdraw from ${pool.description} pool`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(decimalsRisky, decimalsStable)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }

      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      await usePool(this.signers[0], this.contracts, pool.calibration)
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
      await useMargin(
        this.signers[0],
        this.contracts,
        parseWei('1000'),
        parseWei('1000'),
        this.contracts.router.address
      )
    })

    describe('success cases', function () {
      it('withdraws from stable tokens from margin', async function () {
        const [delRisky, delStable] = [parseWei('0'), parseWei('998')]
        await expect(() => this.contracts.router.withdraw(delRisky.raw, delStable.raw)).to.decreaseMargin(
          this.contracts.engine,
          this.contracts.router.address,
          delRisky.raw,
          delStable.raw
        )
      })

      it('withdraws from risky tokens from margin', async function () {
        const [delRisky, delStable] = [parseWei('998'), parseWei('0')]
        await expect(() => this.contracts.router.withdraw(delRisky.raw, delStable.raw)).to.decreaseMargin(
          this.contracts.engine,
          this.contracts.router.address,
          delRisky.raw,
          delStable.raw
        )
      })

      it('withdraws both tokens from the margin account', async function () {
        const [delRisky, delStable] = [parseWei('999'), parseWei('998')]
        await expect(() => this.contracts.router.withdraw(delRisky.raw, delStable.raw)).to.decreaseMargin(
          this.contracts.engine,
          this.contracts.router.address,
          delRisky.raw,
          delStable.raw
        )

        const margin = await this.contracts.engine.margins(this.contracts.router.address)

        expect(margin.balanceRisky).to.equal(parseWei('1').raw)
        expect(margin.balanceStable).to.equal(parseWei('2').raw)
      })

      it('transfers both the tokens to msg.sender of withdraw', async function () {
        const riskyBalance = await this.contracts.risky.balanceOf(this.signers[0].address)
        const stableBalance = await this.contracts.stable.balanceOf(this.signers[0].address)

        await this.contracts.router.withdraw(parseWei('500').raw, parseWei('250').raw)

        expect(await this.contracts.risky.balanceOf(this.signers[0].address)).to.equal(
          riskyBalance.add(parseWei('500').raw)
        )

        expect(await this.contracts.stable.balanceOf(this.signers[0].address)).to.equal(
          stableBalance.add(parseWei('250').raw)
        )
      })

      it('transfers both the tokens to another recipient', async function () {
        const riskyBalance = await this.contracts.risky.balanceOf(this.signers[2].address)
        const stableBalance = await this.contracts.stable.balanceOf(this.signers[2].address)

        const recipient = this.signers[2]
        await expect(() =>
          this.contracts.router.withdrawToRecipient(recipient.address, parseWei('500').raw, parseWei('250').raw)
        ).to.changeTokenBalances(this.contracts.risky, [recipient], [parseWei('500').raw])

        expect(await this.contracts.risky.balanceOf(recipient.address)).to.equal(riskyBalance.add(parseWei('500').raw))
        expect(await this.contracts.stable.balanceOf(recipient.address)).to.equal(
          stableBalance.add(parseWei('250').raw)
        )
      })

      it('emits the Withdraw event', async function () {
        await expect(this.contracts.router.withdraw(parseWei('1000').raw, parseWei('1000').raw))
          .to.emit(this.contracts.engine, 'Withdraw')
          .withArgs(this.contracts.router.address, this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw)
      })
    })

    describe('fail cases', function () {
      it('reverts when attempting to withdraw more than is in margin', async function () {
        await expect(
          this.contracts.router.withdraw(constants.MaxUint256.div(2), constants.MaxUint256.div(2))
        ).to.be.reverted
      })
    })
  })
})
