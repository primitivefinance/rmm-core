import { waffle } from 'hardhat'
import { BigNumber, ethers, Wallet } from 'ethers'
import { Fixture } from 'ethereum-waffle'

import { abi as TOKEN_ABI, bytecode as TOKEN_BYTECODE } from '../../artifacts/contracts/test/Token.sol/Token.json'
import {
  abi as ENGINE_ABI,
  bytecode as ENGINE_BYTECODE,
} from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'
import {
  abi as HOUSE_ABI,
  bytecode as HOUSE_BYTECODE,
} from '../../artifacts/contracts/PrimitiveHouse.sol/PrimitiveHouse.json'
import {
  abi as PRIMITIVE_FACTORY_ABI,
  bytecode as PRIMITIVE_FACTORY_BYTECODE,
} from '../../artifacts/contracts/PrimitiveFactory.sol/PrimitiveFactory.json'
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import {
  abi as CALLEE_ABI,
  bytecode as CALLEE_BYTECODE,
} from '../../artifacts/contracts/test/TestCallee.sol/TestCallee.json'

import {
  abi as Test_Fac_Abi,
  bytecode as Test_Fac_Bytecode,
} from '../../artifacts/contracts/test/TestFactory.sol/TestFactory.json'

import {
  abi as Test_Engine_Abi,
  bytecode as Test_Engine_Bytecode,
} from '../../artifacts/contracts/test/TestEngine.sol/TestEngine.json'

import {
  abi as BS_ABI,
  bytecode as BS_BYTECODE,
} from '../../artifacts/contracts/test/TestBlackScholes.sol/TestBlackScholes.json'

import {
  PrimitiveHouse,
  PrimitiveEngine,
  PrimitiveFactory,
  TestFactory,
  TestEngine,
  TestBlackScholes,
  IUniswapV3Factory,
  IERC20,
  TestCallee,
} from '../../typechain'

const tokensFixture: Fixture<{
  TX1: IERC20
  TY2: IERC20
}> = async ([wallet]) => {
  const TX1 = (await waffle.deployContract(wallet, {
    bytecode: TOKEN_BYTECODE,
    abi: TOKEN_ABI,
  })) as IERC20
  const TY2 = (await waffle.deployContract(wallet, {
    bytecode: TOKEN_BYTECODE,
    abi: TOKEN_ABI,
  })) as IERC20

  await TX1.mint(wallet.address, BigNumber.from(2).pow(255))
  await TY2.mint(wallet.address, BigNumber.from(2).pow(255))
  return { TX1, TY2 }
}

const uniV3FactoryFixture: Fixture<IUniswapV3Factory> = async ([wallet]) => {
  return (await waffle.deployContract(wallet, {
    bytecode: FACTORY_BYTECODE,
    abi: FACTORY_ABI,
  })) as IUniswapV3Factory
}

const primitiveHouseFixture: Fixture<PrimitiveHouse> = async ([wallet]) => {
  return (await waffle.deployContract(wallet, {
    bytecode: HOUSE_BYTECODE,
    abi: HOUSE_ABI,
  })) as PrimitiveHouse
}

const primitiveCalleeFixture: Fixture<TestCallee> = async ([wallet]) => {
  return (await waffle.deployContract(wallet, {
    bytecode: CALLEE_BYTECODE,
    abi: CALLEE_ABI,
  })) as TestCallee
}

export const primitiveProtocolFixture: Fixture<{
  TX1: IERC20
  TY2: IERC20
  uniFactory: IUniswapV3Factory
  house: PrimitiveHouse
  factory: PrimitiveFactory
  engine: PrimitiveEngine
  callee: TestCallee
  bs: TestBlackScholes
}> = async ([wallet], provider) => {
  const { TX1, TY2 } = await tokensFixture([wallet], provider)
  const uniFactory = await uniV3FactoryFixture([wallet], provider)
  const house = await primitiveHouseFixture([wallet], provider)
  const callee = await primitiveCalleeFixture([wallet], provider)
  const factory = (await waffle.deployContract(
    wallet,
    {
      bytecode: PRIMITIVE_FACTORY_BYTECODE,
      abi: PRIMITIVE_FACTORY_ABI,
    },
    []
  )) as PrimitiveFactory

  await factory.create(TX1.address, TY2.address)

  const engine = new ethers.Contract(
    await factory.getEngine(TX1.address, TY2.address),
    ENGINE_ABI,
    wallet
  ) as PrimitiveEngine

  const fee = 3000

  await uniFactory.createPool(TX1.address, TY2.address, fee)
  await house.initialize(engine.address, uniFactory.address, fee)
  await callee.initialize(engine.address, uniFactory.address, fee)

  const bs = (await waffle.deployContract(
    wallet,
    {
      bytecode: BS_BYTECODE,
      abi: BS_ABI,
    },
    [engine.address]
  )) as TestBlackScholes
  return { TX1, TY2, uniFactory, house, factory, engine, callee, bs }
}

export const testEngineFixture: Fixture<{
  TX1: IERC20
  TY2: IERC20
  callee: TestCallee
  testFactory: TestFactory
  testEngine: TestEngine
  bs: TestBlackScholes
}> = async ([wallet], provider) => {
  const { TX1, TY2, uniFactory, house, factory, engine, callee, bs } = await primitiveProtocolFixture([wallet], provider)
  const testFactory = (await waffle.deployContract(
    wallet,
    {
      bytecode: Test_Fac_Bytecode,
      abi: Test_Fac_Abi,
    },
    []
  )) as TestFactory
  await testFactory.create(TX1.address, TY2.address)
  const testEngine = new ethers.Contract(
    await testFactory.getEngine(TX1.address, TY2.address),
    Test_Engine_Abi,
    wallet
  ) as TestEngine

  return { TX1, TY2, callee, testFactory, testEngine, bs }
}
