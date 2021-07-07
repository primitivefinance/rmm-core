import { expect } from 'chai'
import { constants } from 'ethers'
import * as entities from '../entities'
import { parseWei, Wei, Percentage, Time, toBN } from 'web3-units'

const { strike, sigma, maturity, lastTimestamp, spot } = {
  strike: parseWei('2500'),
  sigma: new Percentage(toBN(Percentage.Mantissa * 1.1)),
  maturity: new Time(Time.YearInSeconds + +Date.now() / 1000),
  lastTimestamp: new Time(+Date.now() / 1000),
  spot: parseWei('1750'),
}
const addressKey = constants.AddressZero
const zero = parseWei(0)

describe('SDK: Engine entity', function () {
  let entity: entities.Engine
  let poolId: string, posId: string, initialLiquidity: Wei, initialRisky: Wei, initialStable: Wei
  before(async function () {})

  describe('core functions', function () {
    beforeEach(async function () {
      const stable = new entities.Token(1, constants.AddressZero, 18)
      const risky = stable
      poolId = entities.Engine.getPoolId(strike, sigma, maturity).toString()
      posId = entities.Engine.getPositionId(constants.AddressZero, poolId).toString()
      entity = new entities.Engine(risky, stable)
      const margin = { [addressKey]: { balanceRisky: zero, balanceStable: zero } }
      const reserve = { [poolId]: { reserveRisky: zero, reserve: zero, liquidity: zero, float: zero, debt: zero } }
      const position = { [posId]: { liquidity: zero, float: zero, debt: zero } }
      const setting = {
        [poolId]: {
          strike: strike,
          sigma: sigma,
          maturity: maturity,
          lastTimestamp: lastTimestamp,
        },
      }
      entity.init(setting, reserve, position, margin)
      initialLiquidity = parseWei('1')
      ;({ initialRisky, initialStable } = entity.create(
        constants.AddressZero,
        strike,
        sigma,
        maturity,
        lastTimestamp,
        spot,
        initialLiquidity
      )) // create the curve and initialize liquidity
    })

    it('deposit', async function () {
      const [amount0, amount1] = [parseWei('1000'), parseWei('0')]
      entity.deposit(constants.AddressZero, amount0, amount1)
      expect(entity.margins[constants.AddressZero].balanceRisky.raw).to.be.eq(amount0.raw)
      expect(entity.margins[constants.AddressZero].balanceStable.raw).to.be.eq(amount1.raw)
    })

    it('withdraw', async function () {
      const [amount0, amount1] = [parseWei('1000'), parseWei('0')]
      entity.deposit(constants.AddressZero, amount0, amount1)
      entity.withdraw(constants.AddressZero, amount0, amount1)
      expect(entity.margins[constants.AddressZero].balanceRisky.raw).to.be.eq(0)
      expect(entity.margins[constants.AddressZero].balanceStable.raw).to.be.eq(0)
    })

    it('allocate', async function () {
      const amount0 = parseWei('10')
      entity.allocate(poolId, constants.AddressZero, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
    })

    it('remove', async function () {
      const amount0 = parseWei('10')
      entity.allocate(poolId, constants.AddressZero, amount0)
      entity.remove(poolId, constants.AddressZero, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(initialLiquidity.raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(initialLiquidity.raw)
    })

    it('swap', async function () {
      const amount0 = parseWei('10')
      entity.allocate(poolId, constants.AddressZero, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      entity.swap(poolId, true, parseWei('1'))
    })

    it('lend', async function () {
      const amount0 = parseWei('10')
      entity.lend(poolId, constants.AddressZero, amount0)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw)
      expect(entity.positions[posId].float.raw).to.be.eq(amount0.raw)
    })

    it('claim', async function () {
      const amount0 = parseWei('10')
      entity.lend(poolId, constants.AddressZero, amount0)
      entity.claim(poolId, constants.AddressZero, amount0)
      expect(entity.reserves[poolId].float.raw).to.be.eq(0)
      expect(entity.positions[posId].float.raw).to.be.eq(0)
    })

    it('borrow', async function () {
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.eq(initialRisky.raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.eq(initialStable.raw)
      const amount0 = parseWei('10')
      let { delRisky, delStable } = entity.allocate(poolId, constants.AddressZero, amount0.mul(2))
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.eq(initialRisky.add(delRisky).raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.eq(initialStable.add(delStable).raw)
      entity.lend(poolId, constants.AddressZero, amount0.mul(2))
      ;({ delRisky, delStable } = entity.borrow(poolId, constants.AddressZero, amount0))
      expect(entity.positions[posId].debt.raw).to.be.eq(amount0.raw)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw) // we added twice the float, then borrowed half
      expect(entity.reserves[poolId].debt.raw).to.be.eq(amount0.raw)
    })

    it('repay', async function () {
      const amount0 = parseWei('10')
      let { delRisky, delStable } = entity.allocate(poolId, constants.AddressZero, amount0)
      entity.lend(poolId, constants.AddressZero, amount0)
      entity.borrow(poolId, constants.AddressZero, amount0)
      entity.repay(poolId, constants.AddressZero, amount0)
      // no net change
      expect(entity.positions[posId].debt.raw).to.be.eq(0)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(initialRisky.raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(initialStable.raw)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw)
      expect(entity.reserves[poolId].debt.raw).to.be.eq(0)
    })
  })
})
