import { waffle } from 'hardhat'
import { Wallet } from 'ethers'
import { Fixture } from 'ethereum-waffle'

import { abi as TOKEN_ABI, bytecode as TOKEN_BYTECODE } from '../../artifacts/contracts/test/Token.sol/Token.json'
import {
  abi as ENGINE_ABI,
  bytecode as ENGINE_BYTECODE,
} from '../../artifacts/contracts/test/TestEngine.sol/TestEngine.json'
import {
  abi as HOUSE_ABI,
  bytecode as HOUSE_BYTECODE,
} from '../../artifacts/contracts/PrimitiveHouse.sol/PrimitiveHouse.json'
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import {
  abi as CALLEE_ABI,
  bytecode as CALLEE_BYTECODE,
} from '../../artifacts/contracts/test/TestCallee.sol/TestCallee.json'

import { PrimitiveHouse, TestEngine, IUniswapV3Factory, IERC20, TestCallee } from '../../typechain'

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
  engine: TestEngine
  callee: TestCallee
}> = async ([wallet], provider) => {
  const { TX1, TY2 } = await tokensFixture([wallet], provider)
  const uniFactory = await uniV3FactoryFixture([wallet], provider)
  const house = await primitiveHouseFixture([wallet], provider)
  const callee = await primitiveCalleeFixture([wallet], provider)
  const engine = (await waffle.deployContract(
    wallet,
    {
      bytecode: ENGINE_BYTECODE,
      abi: ENGINE_ABI,
    },
    [TX1.address, TY2.address]
  )) as TestEngine

  await house.initialize(engine.address)
  await callee.initialize(engine.address)

  return { TX1, TY2, uniFactory, house, engine, callee }
}
