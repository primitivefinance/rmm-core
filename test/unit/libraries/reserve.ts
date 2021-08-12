import expect from '../../shared/expect'
import { waffle } from 'hardhat'
import { BigNumber, BytesLike } from 'ethers'
import { parseWei } from 'web3-units'
import { TestReserve } from '../../../typechain'
import loadContext from '../context'

describe('testReserve', function () {
  before(async function () {
    loadContext(waffle.provider, ['testReserve'])
  })

  describe('reserve', function () {
    let resId: BytesLike, reserve: TestReserve
    let timestamp: number, reserveRisky: BigNumber, reserveStable: BigNumber
    let before: any, timestep: number

    beforeEach(async function () {
      reserve = this.contracts.testReserve // the test reserve contract
      timestamp = 1645473600 // the timestamp for the tests
      reserveRisky = parseWei('0.5').raw // initialized risky reserve amount
      reserveStable = parseWei('500').raw // initialized stable reserve amount
      await reserve.beforeEach('reserve', timestamp, reserveRisky, reserveStable) // init a reserve data struct w/ arbitrary reserves
      resId = await reserve.reserveId() // reserve Id we will manipulate for tests
      before = await reserve.res() // actual reserve data we are manipulating for tests
      timestep = 60 * 60 * 24 // 1 day timestep
    })

    it('should have same timestamp', async function () {
      expect(before.blockTimestamp).to.be.eq(timestamp)
    })

    it('shouldUpdate', async function () {
      await reserve.step(timestep) // step forward a day
      timestamp += timestep
      expect(await reserve.timestamp()).to.be.eq(timestamp)
      await reserve.shouldUpdate(resId)
      let deltaTime = timestep
      let cumulativeRisky = before.reserveRisky.mul(deltaTime)
      let cumulativeStable = before.reserveStable.mul(deltaTime)
      let cumulativeLiquidity = before.liquidity.mul(deltaTime)
      expect(await reserve.res()).to.be.deep.eq([
        before.reserveRisky,
        before.reserveStable,
        before.liquidity,
        before.float,
        before.debt,
        before.blockTimestamp + timestep,
        cumulativeRisky,
        cumulativeStable,
        cumulativeLiquidity,
      ])
    })

    it('shouldSwap risky to stable', async function () {
      let deltaIn = parseWei('0.1').raw // risky in
      let deltaOut = parseWei('100').raw // stable out
      await reserve.shouldSwap(resId, true, deltaIn, deltaOut)
      expect(await reserve.res()).to.be.deep.eq([
        before.reserveRisky.add(deltaIn),
        before.reserveStable.sub(deltaOut),
        before.liquidity,
        before.float,
        before.debt,
        before.blockTimestamp,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
      ])
    })

    it('shouldAllocate', async function () {
      let delRisky = parseWei('0.1').raw
      let delStable = parseWei('100').raw
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldAllocate(resId, delRisky, delStable, delLiquidity)
      expect(await reserve.res()).to.be.deep.eq([
        before.reserveRisky.add(delRisky),
        before.reserveStable.add(delStable),
        before.liquidity.add(delLiquidity),
        before.float,
        before.debt,
        before.blockTimestamp,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
      ])
    })
    it('shouldRemove', async function () {
      let delRisky = parseWei('0.1').raw
      let delStable = parseWei('100').raw
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldRemove(resId, delRisky, delStable, delLiquidity)
      expect(await reserve.res()).to.be.deep.eq([
        before.reserveRisky.sub(delRisky),
        before.reserveStable.sub(delStable),
        before.liquidity.sub(delLiquidity),
        before.float,
        before.debt,
        before.blockTimestamp,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
      ])
    })
    it('shouldAddFloat', async function () {
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldAddFloat(resId, delLiquidity)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.add(delLiquidity))
    })
    it('shouldRemoveFloat', async function () {
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldRemoveFloat(resId, delLiquidity)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.sub(delLiquidity)) // remain unchanged
    })
    it('shouldBorrowFloat', async function () {
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldBorrowFloat(resId, delLiquidity)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.sub(delLiquidity))
      expect((await reserve.res()).debt).to.be.deep.eq(before.debt.add(delLiquidity))
    })
    it('shouldRepayFloat', async function () {
      let delLiquidity = parseWei('0.1').raw
      await reserve.shouldBorrowFloat(resId, delLiquidity) // borrow so we can repay
      await reserve.shouldRepayFloat(resId, delLiquidity) // repay the borrowed float
      expect((await reserve.res()).float).to.be.deep.eq(before.float) // no changes because we add then sub
      expect((await reserve.res()).debt).to.be.deep.eq(before.debt) // no changes because...
    })
  })
})
