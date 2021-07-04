import { waffle } from 'hardhat'
import { expect } from 'chai'
import { Wallet } from 'ethers'
import { config } from '../../../unit/context'

import Engine, { getEngineEntityFromContract } from '../../../shared/sdk/Engine'
import { parseWei, BytesLike, constants, Wei, Percentage, Time } from '../../../shared/sdk/Units'
import { initializeBaseContracts } from '../../../unit/createTestContracts'
import { PrimitiveEngine, PrimitiveFactory, Token } from '../../../../typechain'

const { strike, sigma, maturity, lastTimestamp, spot } = config
const empty: BytesLike = constants.HashZero

describe('SDK: Engine entity', function () {
  let signers: Wallet[], deployer: Wallet
  let factory: PrimitiveFactory, engine: PrimitiveEngine, risky: Token, stable: Token
  let entity: Engine
  let poolId: string, posId: string, initialLiquidity: Wei, initialRisky: Wei, initialStable: Wei
  before(async function () {
    signers = waffle.provider.getWallets()
    deployer = signers[0]
  })

  describe('core functions', function () {
    beforeEach(async function () {
      ;({ factory, engine, stable, risky } = await initializeBaseContracts(deployer))
      poolId = Engine.getPoolId(strike, sigma, maturity).toString()
      posId = Engine.getPositionId(deployer.address, poolId).toString()
      entity = await getEngineEntityFromContract(engine, [poolId], [posId], [deployer.address])
      initialLiquidity = parseWei('1')
      ;({ initialRisky, initialStable } = await entity.create(
        deployer.address,
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
      await entity.deposit(deployer.address, amount0, amount1)
      expect(entity.margins[deployer.address].balanceRisky.raw).to.be.eq(amount0.raw)
      expect(entity.margins[deployer.address].balanceStable.raw).to.be.eq(amount1.raw)
    })

    it('withdraw', async function () {
      const [amount0, amount1] = [parseWei('1000'), parseWei('0')]
      await entity.deposit(deployer.address, amount0, amount1)
      await entity.withdraw(deployer.address, amount0, amount1)
      expect(entity.margins[deployer.address].balanceRisky.raw).to.be.eq(0)
      expect(entity.margins[deployer.address].balanceStable.raw).to.be.eq(0)
    })

    it('allocate', async function () {
      const amount0 = parseWei('10')
      await entity.allocate(poolId, deployer.address, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
    })

    it('remove', async function () {
      const amount0 = parseWei('10')
      await entity.allocate(poolId, deployer.address, amount0)
      await entity.remove(poolId, deployer.address, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(initialLiquidity.raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(initialLiquidity.raw)
    })

    it('swap', async function () {
      const amount0 = parseWei('10')
      await entity.allocate(poolId, deployer.address, amount0)
      expect(entity.reserves[poolId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(0)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(0)
      expect(entity.positions[posId].liquidity.raw).to.be.eq(amount0.add(initialLiquidity).raw)
      await entity.swap(poolId, true, parseWei('1'))
    })

    it('lend', async function () {
      const amount0 = parseWei('10')
      await entity.lend(poolId, deployer.address, amount0)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw)
      expect(entity.positions[posId].float.raw).to.be.eq(amount0.raw)
    })

    it('claim', async function () {
      const amount0 = parseWei('10')
      await entity.lend(poolId, deployer.address, amount0)
      await entity.claim(poolId, deployer.address, amount0)
      expect(entity.reserves[poolId].float.raw).to.be.eq(0)
      expect(entity.positions[posId].float.raw).to.be.eq(0)
    })

    it('borrow', async function () {
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.eq(initialRisky.raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.eq(initialStable.raw)
      const amount0 = parseWei('10')
      let { delRisky, delStable } = await entity.allocate(poolId, deployer.address, amount0.mul(2))
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.eq(initialRisky.add(delRisky).raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.eq(initialStable.add(delStable).raw)
      await entity.lend(poolId, deployer.address, amount0.mul(2))
      ;({ delRisky, delStable } = await entity.borrow(poolId, deployer.address, amount0))
      expect(entity.positions[posId].debt.raw).to.be.eq(amount0.raw)
      expect(entity.positions[posId].balanceRisky.raw).to.be.eq(amount0.raw)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw) // we added twice the float, then borrowed half
      expect(entity.reserves[poolId].debt.raw).to.be.eq(amount0.raw)
    })

    it('repay', async function () {
      const amount0 = parseWei('10')
      let { delRisky, delStable } = await entity.allocate(poolId, deployer.address, amount0)
      await entity.lend(poolId, deployer.address, amount0)
      await entity.borrow(poolId, deployer.address, amount0)
      await entity.repay(poolId, deployer.address, amount0)
      // no net change
      expect(entity.positions[posId].debt.raw).to.be.eq(0)
      expect(entity.positions[posId].balanceRisky.raw).to.be.eq(0)
      expect(entity.reserves[poolId].reserveRisky.raw).to.be.gte(initialRisky.raw)
      expect(entity.reserves[poolId].reserveStable.raw).to.be.gte(initialStable.raw)
      expect(entity.reserves[poolId].float.raw).to.be.eq(amount0.raw)
      expect(entity.reserves[poolId].debt.raw).to.be.eq(0)
    })
  })
})
