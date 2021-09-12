import expect from '../../../shared/expect'
import { constants } from 'ethers'
import { parseWei } from 'web3-units'

import { PoolState, TestPools } from '../../../shared/poolConfigs'
import { primitiveFixture } from '../../../shared/fixtures'
import { testContext } from '../../../shared/testContext'
import { useTokens, useApproveAll, useMargin } from '../../../shared/hooks'
const { HashZero } = constants

TestPools.forEach(function (pool: PoolState) {
  testContext(`deposit to engine`, function () {
    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      await useMargin(this.signers[0], this.contracts, parseWei('1000'), parseWei('1000'), this.contracts.router.address)
    })

    describe('success cases', function () {
      it('adds to the user margin account', async function () {
        await expect(
          this.contracts.router.deposit(this.signers[0].address, parseWei('1001').raw, parseWei('999').raw, HashZero)
        ).to.increaseMargin(this.contracts.engine, this.signers[0].address, parseWei('1001').raw, parseWei('999').raw)
      })

      it('adds to the margin account of another address when specified', async function () {
        await expect(
          this.contracts.router.deposit(this.contracts.router.address, parseWei('101').raw, parseWei('100').raw, HashZero)
        ).to.increaseMargin(this.contracts.engine, this.contracts.router.address, parseWei('101').raw, parseWei('100').raw)
      })

      it('increases the balances of the engine contract', async function () {
        const riskyBalance = await this.contracts.risky.balanceOf(this.contracts.engine.address)
        const stableBalance = await this.contracts.stable.balanceOf(this.contracts.engine.address)

        await this.contracts.router.deposit(this.signers[0].address, parseWei('500').raw, parseWei('250').raw, HashZero)

        expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.equal(
          riskyBalance.add(parseWei('500').raw)
        )

        expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.equal(
          stableBalance.add(parseWei('250').raw)
        )
      })

      it('increases the previous margin when called another time', async function () {
        await this.contracts.router.deposit(this.signers[0].address, parseWei('1001').raw, parseWei('999').raw, HashZero)
        await this.contracts.router.deposit(this.signers[0].address, parseWei('999').raw, parseWei('1001').raw, HashZero)

        const margin = await this.contracts.engine.margins(this.signers[0].address)

        expect(margin.balanceRisky).to.equal(parseWei('2000').raw)
        expect(margin.balanceStable).to.equal(parseWei('2000').raw)
      })

      it('emits the Deposit event', async function () {
        await expect(
          this.contracts.router.deposit(this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw, HashZero)
        )
          .to.emit(this.contracts.engine, 'Deposit')
          .withArgs(this.contracts.router.address, this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw)
      })
    })

    describe('fail cases', function () {
      it('reverts when the user does not have sufficient funds', async function () {
        await expect(
          this.contracts.router.deposit(
            this.contracts.router.address,
            constants.MaxUint256.div(2),
            constants.MaxUint256.div(2),
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts when the callback did not transfer the stable', async function () {
        await expect(
          this.contracts.router.depositOnlyRisky(
            this.signers[0].address,
            parseWei('1000').raw,
            parseWei('1000').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts when the callback did not transfer the risky', async function () {
        await expect(
          this.contracts.router.depositOnlyStable(
            this.signers[0].address,
            parseWei('1000').raw,
            parseWei('1000').raw,
            HashZero
          )
        ).to.be.reverted
      })

      it('reverts when the callback did not transfer the risky or the stable', async function () {
        await expect(
          this.contracts.router.depositFail(this.signers[0].address, parseWei('1000').raw, parseWei('1000').raw, HashZero)
        ).to.be.reverted
      })
    })
  })
})
