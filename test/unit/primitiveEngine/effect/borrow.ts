import { waffle, ethers } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, Wallet } from 'ethers'

import { parseWei, PERCENTAGE, BytesLike } from '../../../shared/sdk/Units'

import loadContext from '../../context'
import { borrowFragment } from '../fragments'
import { EngineBorrow, PrimitiveEngine } from '../../../../typechain'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 1655655140, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('borrow', function () {
  before(async function () {
    await loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineLend', 'engineBorrow'],
      borrowFragment
    )
  })

  describe('when the parameters are valid', function () {
    let poolId: BytesLike, posId: BytesLike
    let deployer: Wallet, engine: PrimitiveEngine, engineBorrow: EngineBorrow

    beforeEach(async function () {
      poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      posId = await this.contracts.engineBorrow.getPosition(poolId)
      ;[deployer, engine, engineBorrow] = [this.signers[0], this.contracts.engine, this.contracts.engineBorrow]
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.contracts.engineLend.address,
        parseWei('1000').raw,
        empty
      )

      await this.contracts.engineLend.lend(poolId, parseWei('100').raw)
    })
    describe('success cases', async function () {
      it('originates one long option position', async function () {
        await engineBorrow.borrow(poolId, engineBorrow.address, parseWei('1').raw, empty)
        expect(await engine.positions(posId)).to.be.deep.eq([parseWei('0').raw, parseWei('0').raw, parseWei('1').raw])
      })

      it('repays a long option position, earning the proceeds', async function () {
        let riskyBal = await this.contracts.risky.balanceOf(deployer.address)
        await engineBorrow.borrow(poolId, engineBorrow.address, parseWei('1').raw, empty) // spends premium
        let premium = riskyBal.sub(await this.contracts.risky.balanceOf(deployer.address))
        await expect(() =>
          engineBorrow.repay(poolId, engineBorrow.address, parseWei('1').raw, false, empty)
        ).to.changeTokenBalances(this.contracts.risky, [deployer], [premium])
        expect(await engine.positions(posId)).to.be.deep.eq([parseWei('0').raw, parseWei('0').raw, parseWei('0').raw])
      })
    })

    describe('fail cases', async function () {
      it('fails to originate more long option positions than are allocated to float', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('2000').raw, empty)).to.be.reverted
      })

      it('fails to originate 0 long options', async function () {
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('0').raw, empty)).to.be.reverted
      })

      it('fails to originate 1 long option, because of active liquidity position', async function () {
        await this.contracts.engineAllocate.allocateFromExternal(poolId, engineBorrow.address, parseWei('1').raw, empty)
        await expect(engineBorrow.borrow(poolId, engineBorrow.address, parseWei('1').raw, empty)).to.be.reverted
      })

      it('fails to originate 1 long option, because premium is above max premium', async function () {
        await expect(engineBorrow.borrowMaxPremium(poolId, engineBorrow.address, parseWei('1').raw, 0, empty)).to.be.reverted
      })

      it('fails to originate 1 long option, because no tokens were paid', async function () {
        await expect(engineBorrow.borrowWithoutPaying(poolId, engineBorrow.address, parseWei('1').raw, empty)).to.be.reverted
      })
    })
  })
})
