import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, BytesLike, parseWei } from '../../shared/Units'
import { TestReserve } from '../../../typechain'
import loadContext from '../context'

describe('testReserve', function () {
  before(async function () {
    await loadContext(waffle.provider, ['testReserve'], async () => {})
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
      let cumulativeRisky = before.RX1.mul(deltaTime)
      let cumulativeStable = before.RY2.mul(deltaTime)
      let cumulativeLiquidity = before.liquidity.mul(deltaTime)
      expect(await reserve.res()).to.be.deep.eq([
        before.RX1,
        before.RY2,
        before.liquidity,
        before.float,
        before.debt,
        cumulativeRisky,
        cumulativeStable,
        cumulativeLiquidity,
        before.blockTimestamp,
      ])
    })

    it('shouldSwap risky to stable', async function () {
      let deltaIn = parseWei('0.1').raw // risky in
      let deltaOut = parseWei('100').raw // stable out
      await reserve.shouldSwap(resId, true, deltaIn, deltaOut)
      expect(await reserve.res()).to.be.deep.eq([
        before.RX1.add(deltaIn),
        before.RY2.sub(deltaOut),
        before.liquidity,
        before.float,
        before.debt,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
        before.blockTimestamp,
      ])
    })

    it('shouldAllocate', async function () {
      let deltaX = parseWei('0.1').raw
      let deltaY = parseWei('100').raw
      let deltaL = parseWei('0.1').raw
      await reserve.shouldAllocate(resId, deltaX, deltaY, deltaL)
      expect(await reserve.res()).to.be.deep.eq([
        before.RX1.add(deltaX),
        before.RY2.add(deltaY),
        before.liquidity.add(deltaL),
        before.float,
        before.debt,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
        before.blockTimestamp,
      ])
    })
    it('shouldRemove', async function () {
      let deltaX = parseWei('0.1').raw
      let deltaY = parseWei('100').raw
      let deltaL = parseWei('0.1').raw
      await reserve.shouldRemove(resId, deltaX, deltaY, deltaL)
      expect(await reserve.res()).to.be.deep.eq([
        before.RX1.sub(deltaX),
        before.RY2.sub(deltaY),
        before.liquidity.sub(deltaL),
        before.float,
        before.debt,
        before.cumulativeRisky,
        before.cumulativeStable,
        before.cumulativeLiquidity,
        before.blockTimestamp,
      ])
    })
    it('shouldAddFloat', async function () {
      let deltaL = parseWei('0.1').raw
      await reserve.shouldAddFloat(resId, deltaL)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.add(deltaL))
    })
    it('shouldRemoveFloat', async function () {
      let deltaL = parseWei('0.1').raw
      await reserve.shouldRemoveFloat(resId, deltaL)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.sub(deltaL)) // remain unchanged
    })
    it('shouldBorrowFloat', async function () {
      let deltaL = parseWei('0.1').raw
      await reserve.shouldBorrowFloat(resId, deltaL)
      expect((await reserve.res()).float).to.be.deep.eq(before.float.sub(deltaL))
      expect((await reserve.res()).debt).to.be.deep.eq(before.debt.add(deltaL))
    })
    it('shouldRepayFloat', async function () {
      let deltaL = parseWei('0.1').raw
      await reserve.shouldBorrowFloat(resId, deltaL) // borrow so we can repay
      await reserve.shouldRepayFloat(resId, deltaL) // repay the borrowed float
      expect((await reserve.res()).float).to.be.deep.eq(before.float) // no changes because we add then sub
      expect((await reserve.res()).debt).to.be.deep.eq(before.debt) // no changes because...
    })
  })
})
