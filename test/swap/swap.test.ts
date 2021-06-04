import { expect } from 'chai'
import { loadFixture } from 'ethereum-waffle'
import hre from 'hardhat'
import { deployMockContract, MockContract } from 'ethereum-waffle'
import { Wallet, Contract, constants, utils } from 'ethers'

import { createEngineFunctions } from '../shared/Engine'

import { primitiveEngineFixture, PrimitiveEngineFixture } from '../unit/fixtures'
import {
  PrimitiveEngine,
  TestBlackScholes,
  TestBlackScholes__factory,
  TestEngineSwap,
  TestEngineSwap__factory,
} from '../../typechain'

export type TestEngineSwapFixture = {
  primitiveEngine: PrimitiveEngine
  signers: Wallet[]
  risky: MockContract
  stable: MockContract
  testEngineSwap: TestEngineSwap
  bs: TestBlackScholes
}

export async function testEngineSwapFixture(signers: Wallet[]): Promise<TestEngineSwapFixture> {
  const [deployer] = signers

  const { primitiveEngine, risky, stable } = await primitiveEngineFixture(signers)

  const testEngineSwap = await new TestEngineSwap__factory(deployer).deploy()
  const bs = await new TestBlackScholes__factory(deployer).deploy(primitiveEngine.address)

  return {
    primitiveEngine,
    signers,
    risky,
    stable,
    testEngineSwap,
    bs,
  }
}

const [strike, sigma, time] = [utils.parseEther('1000'), 0.85 * 10000, 31449600]

describe('swap', () => {
  let context: TestEngineSwapFixture
  let create

  beforeEach(async () => {
    context = await loadFixture(testEngineSwapFixture)
  })

  it('should have same tokens', async () => {
    expect(await context.primitiveEngine.risky()).to.equal(context.risky.address)
    expect(await context.primitiveEngine.stable()).to.equal(context.stable.address)
  })

  it('should swap through TestEngineSwap contract using useRef', async () => {
    const pid = await context.primitiveEngine.getPoolId(strike, sigma, time)
    ;({ create } = createEngineFunctions({
      target: context.testEngineSwap,
      TX1: context.risky,
      TY2: context.stable,
      engine: context.primitiveEngine,
      bs: context.bs,
    }))

    await create(strike, sigma, time, utils.parseEther('1100'))
    console.log(await context.primitiveEngine.reserves(pid))
    /* await context.testEngineSwap.shouldSwap(
      context.primitiveEngine.address,
      pid,
      true,
      utils.parseEther('1'),
      constants.MaxUint256
    ) */
  })
})
