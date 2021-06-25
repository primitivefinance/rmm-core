import { waffle } from 'hardhat'
import { expect } from 'chai'

import { PERCENTAGE, parseWei, BytesLike, constants, formatEther, Wei } from '../../../shared/Units'
import loadContext from '../../context'
import Engine from '../../../shared/Engine'

import { createFragment } from '../fragments'
import { getPoolId, getPositionId } from '../../../shared/utilities'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('create', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate', 'testPosition'], createFragment)
  })

  describe('when the parameters are valid', function () {
    it.only('engine class', async function () {
      let eng = new Engine(this.contracts.engine)
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      const posId = getPositionId(this.signers[0].address, poolId)
      await eng.init([poolId], [posId], [this.signers[0].address])
      await eng.deposit(this.signers[0].address, parseWei('1000'), parseWei('0'))
      await eng.allocate(poolId, this.signers[0].address, parseWei('10'))
      expect(eng.margins[this.signers[0].address].balanceRisky).to.be.eq(parseWei('1000').raw)
      expect(eng.reserves[poolId].liquidity.raw).to.be.eq(parseWei('10').raw)
      expect(eng.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(eng.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(eng.positions[posId].liquidity.raw).to.be.eq(parseWei('10').raw)
      let secondPool = getPoolId(parseWei('1050'), new Wei(sigma), time)
      await eng.create(this.signers[0].address, parseWei('1050'), new Wei(sigma), time, parseWei('1100'), parseWei('10'))
      console.log(eng.reserves[secondPool].reserveRisky.parsed)
      await eng.swap(secondPool, true, parseWei('1'))
      console.log(eng.reserves[secondPool].reserveRisky.parsed)
    })
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
    })

    it('emits the Create event', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)

      await expect(this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty))
        .to.emit(this.contracts.engine, 'Created')
        .withArgs(this.contracts.engineCreate.address, poolId, strike, sigma, time)
    })

    it('gives liquidity to the sender', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)

      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)
      const pos = await this.contracts.engineCreate.fetch(poolId)

      expect(pos.liquidity).to.equal(parseWei('1').sub('1000').raw)
    })

    it('updates the reserves of the engine', async function () {
      const tx = await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
      const receipt = await tx.wait()
      const { timestamp } = await waffle.provider.getBlock(receipt.blockNumber)

      const poolId = await this.contracts.engine.getPoolId(strike, sigma, time)

      const reserve = await this.contracts.engine.reserves(poolId)
      console.log(reserve)

      // TODO: Check RX1 and RY2

      expect(reserve.liquidity).to.equal(parseWei('1').raw)
      expect(reserve.float).to.equal(0)
      expect(reserve.debt).to.equal(0)
      expect(reserve.cumulativeLiquidity).to.equal(0)
      expect(reserve.cumulativeRisky).to.equal(0)
      expect(reserve.cumulativeStable).to.equal(0)
      expect(reserve.blockTimestamp).to.equal(timestamp)
    })

    it('increases the engine contract balances', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)

      // TODO: Improve this test
      expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.not.equal(0)
      expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.not.equal(0)
    })

    it('reverts when the pool already exists', async function () {
      await this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
      await expect(
        this.contracts.engineCreate.create(strike, sigma, time, spot, parseWei('1').raw, empty)
      ).to.be.revertedWith('Initialized')
    })
  })

  describe('when the parameters are not valid', function () {
    it('reverts if strike is 0', async function () {
      await expect(this.contracts.engine.create(0, sigma, time, spot, parseWei('1').raw, empty)).to.revertedWith(
        'Calibration cannot be 0'
      )
    })

    it('reverts if sigma is 0', async function () {
      await expect(this.contracts.engine.create(strike, 0, time, spot, parseWei('1').raw, empty)).to.revertedWith(
        'Calibration cannot be 0'
      )
    })

    it('reverts if time is 0', async function () {
      await expect(this.contracts.engine.create(strike, sigma, 0, spot, parseWei('1').raw, empty)).to.revertedWith(
        'Calibration cannot be 0'
      )
    })

    it('reverts if liquidity is 0', async function () {
      await expect(this.contracts.engine.create(strike, sigma, time, spot, 0, empty)).to.revertedWith(
        'Liquidity cannot be 0'
      )
    })
  })
})
