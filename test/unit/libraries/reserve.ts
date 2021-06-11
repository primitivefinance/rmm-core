import hre, { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, BytesLike, parseWei, BigNumberish, Wei } from '../../shared/Units'
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
      const name = 'reserve'
      reserve = this.contracts.testReserve
      timestamp = 1645473600
      reserveRisky = parseWei('0.5').raw
      reserveStable = parseWei('500').raw
      await reserve.beforeEach(name, timestamp, reserveRisky, reserveStable) // init a reserve data struct w/ arbitrary reserves
      resId = await reserve.reserveId()
      before = await reserve.res()
      timestep = 60 * 60 * 24 // 1 day
    })

    it('returns 0 for all fields when the margin account is uninitialized', async function () {
      expect(await this.contracts.engine.reserves('0x882efb9e67eda9bf74766e8686259cb3a1fc8b8a')).to.deep.equal([
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
      ])
    })

    it('should have same timestamp', async function () {
      expect(before.blockTimestamp).to.be.eq(timestamp)
    })

    it('shouldUpdate', async function () {
      await reserve.step(timestep) // step forward a day
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
        timestamp + timestep,
      ])
    })
    it('shouldSwap risky to stable', async function () {
      let deltaIn = parseWei('0.1').raw // risky in
      let deltaOut = parseWei('100').raw // stable out
      await reserve.shouldSwap(resId, true, deltaIn, deltaOut)
      await hre
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
    it('shouldAllocate', async function () {})
    it('shouldRemove', async function () {})
    it('shouldAddFloat', async function () {})
    it('shouldRemoveFloat', async function () {})
    it('shouldBorrowFloat', async function () {})
    it('shouldRepayFloat', async function () {})
    it('shouldUpdate', async function () {})
  })
})
