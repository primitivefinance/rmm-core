import { waffle } from 'hardhat'
import { expect } from 'chai'

import { parseWei, BytesLike, constants, formatEther, Wei } from '../../../shared/sdk/Units'
import Engine from '../../../shared/sdk/Engine'

import loadContext, { config } from '../../context'
import { createFragment } from '../fragments'

const { strike, sigma, maturity, spot } = config
const empty: BytesLike = constants.HashZero

describe('create', function () {
  before(async function () {
    await loadContext(waffle.provider, ['engineCreate', 'testPosition'], createFragment)
  })

  describe('when the parameters are valid', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)
    })

    it('emits the Created event', async function () {
      const poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)

      await expect(
        this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)
      )
        .to.emit(this.contracts.engine, 'Created')
        .withArgs(this.contracts.engineCreate.address, strike.raw, sigma.raw, maturity.raw)
    })

    it('gives liquidity to the sender', async function () {
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)

      const poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)
      const pos = await this.contracts.engineCreate.fetch(poolId)

      expect(pos.liquidity).to.equal(parseWei('1').sub('1000').raw)
    })

    it('updates the reserves of the engine', async function () {
      const tx = await this.contracts.engineCreate.create(
        strike.raw,
        sigma.raw,
        maturity.raw,
        spot.raw,
        parseWei('1').raw,
        empty
      )
      const receipt = await tx.wait()
      const { timestamp } = await waffle.provider.getBlock(receipt.blockNumber)

      const poolId = await this.contracts.engine.getPoolId(strike.raw, sigma.raw, maturity.raw)

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
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)

      // TODO: Improve this test
      expect(await this.contracts.risky.balanceOf(this.contracts.engine.address)).to.not.equal(0)
      expect(await this.contracts.stable.balanceOf(this.contracts.engine.address)).to.not.equal(0)
    })

    it('reverts when the pool already exists', async function () {
      await this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)
      await expect(
        this.contracts.engineCreate.create(strike.raw, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)
      ).to.be.revertedWith('Initialized')
    })
  })

  describe('when the parameters are not valid', function () {
    it('reverts if strike is 0', async function () {
      await expect(
        this.contracts.engine.create(0, sigma.raw, maturity.raw, spot.raw, parseWei('1').raw, empty)
      ).to.revertedWith('Zero')
    })

    it('reverts if sigma.raw is 0', async function () {
      await expect(
        this.contracts.engine.create(strike.raw, 0, maturity.raw, spot.raw, parseWei('1').raw, empty)
      ).to.revertedWith('Zero')
    })

    it('reverts if maturity.raw is 0', async function () {
      await expect(
        this.contracts.engine.create(strike.raw, sigma.raw, 0, spot.raw, parseWei('1').raw, empty)
      ).to.revertedWith('Zero')
    })

    it('reverts if liquidity is 0', async function () {
      await expect(this.contracts.engine.create(strike.raw, sigma.raw, maturity.raw, spot.raw, 0, empty)).to.revertedWith(
        'Zero'
      )
    })
  })
})
