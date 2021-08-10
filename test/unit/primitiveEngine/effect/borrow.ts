import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike, Wallet } from 'ethers'
import { parseWei } from 'web3-units'

import loadContext, { DEFAULT_CONFIG as config } from '../../context'
import { borrowFragment } from '../fragments'
import { EngineBorrow, PrimitiveEngine } from '../../../../typechain'
import { computePoolId } from '../../../shared/utils'

const { strike, sigma, maturity } = config
const empty: BytesLike = constants.HashZero

describe('borrow', function () {
  before(async function () {
    loadContext(
      waffle.provider,
      ['engineCreate', 'engineDeposit', 'engineAllocate', 'engineSupply', 'engineBorrow'],
      borrowFragment
    )
  })

  describe('when the parameters are valid', function () {
    let poolId: BytesLike, posId: BytesLike
    let deployer: Wallet, engine: PrimitiveEngine, engineBorrow: EngineBorrow

    beforeEach(async function () {
      poolId = computePoolId(this.contracts.engine.address, maturity.raw, sigma.raw, strike.raw)
      posId = await this.contracts.engineBorrow.getPosition(poolId)
      ;[deployer, engine, engineBorrow] = [this.signers[0], this.contracts.engine, this.contracts.engineBorrow]
      await this.contracts.engineAllocate.allocateFromExternal(
        poolId,
        this.contracts.engineSupply.address,
        parseWei('1000').raw,
        empty
      )

      await this.contracts.engineSupply.supply(poolId, parseWei('100').raw)
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

      it('fails to originate 1 long option, because no tokens were paid', async function () {
        await expect(engineBorrow.borrowWithoutPaying(poolId, engineBorrow.address, parseWei('1').raw, empty)).to.be.reverted
      })
    })
  })
})
