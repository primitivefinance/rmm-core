import {ethers, waffle} from 'hardhat'
import {Wallet, Contract, BigNumber} from 'ethers'
import {deployContract, link} from 'ethereum-waffle'
import Engine from '../../artifacts/contracts/PrimitiveEngine.sol/PrimitiveEngine.json'
import TestEngine from '../../artifacts/contracts/test/TestEngine.sol/TestEngine.json'
import Token from '../../artifacts/contracts/test/Token.sol/Token.json'
import House from '../../artifacts/contracts/PrimitiveHouse.sol/PrimitiveHouse.json'
import SwapRouter from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json'
import SwapFactory from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

const overrides = {gasLimit: 9500000}

export interface UniswapFixture {
  SwapRouter: Contract
  SwapFactory: Contract
}

export async function uniswapFixture([wallet]: Wallet[], provider): Promise<UniswapFixture> {
  const swapRouter = await deployContract(wallet, SwapRouter, [], overrides)
  const swapFactory = await deployContract(wallet, SwapFactory, [], overrides)
  return {swapRouter, swapFactory}
}

export interface TokensFixture {
  TX1: Contract // risky token like ether
  TY2: Contract // risk free token like dai
}

export async function tokensFixture([wallet]: Wallet[], provider): Promise<TokensFixture> {
  const TX1 = await deployContract(wallet, Token, [], overrides)
  const TY2 = await deployContract(wallet, Token, [], overrides)
  return {TX1, TY2}
}

export interface HouseFixture extends TokensFixture {
  house: Contract
}

export async function houseFixture([wallet]: Wallet[], provider): Promise<HouseFixture> {
  const {TX1, TY2} = await tokensFixture([wallet], provider)
  const house = await deployContract(wallet, House, [], overrides)
  return {house, TX1, TY2}
}

export interface EngineFixture extends HouseFixture {
  engine: Contract
}

export async function engineFixture([wallet]: Wallet[], provider: any): Promise<EngineFixture> {
  const {house, TX1, TY2} = await houseFixture([wallet], provider)
  const engine = await deployContract(wallet, TestEngine, [TX1.address, TY2.address], overrides)
  await house.initialize(engine.address)
  return {engine, house, TX1, TY2}
}
