import { ethers } from 'hardhat'
import expect from './expect'
import { PoolState, TestPools } from './poolConfigs'
import { Wallet } from 'ethers'
//import MockEngineArtifact from '../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

//TestPools.forEach(function (pool: PoolState) {
  describe(`constructor of pool`, function () {
    let signer, other;
    let risky_18, stable_18, risky_6, stable_6, factoryDeploy, factory;
    let positionRenderer, positionDescriptor, weth9;
    let engine_18_18, engine_18_6, engine_6_18, engine_6_6
    let manager_18_18, manager_18_6, manager_6_18, manager_6_6

    before(async function () {
      [signer, other] = await (ethers as any).getSigners()
    })

    beforeEach(async function () {
      const MockEngine = await ethers.getContractFactory("MockEngine")
      const tokenFactory = await ethers.getContractFactory('TestToken')
      //const factoryDeployFactory = await ethers.getContractFactory('FactoryDeploy')
      const PrimitiveManager = await ethers.getContractFactory("PrimitiveManager");
      const WETH9 = await ethers.getContractFactory("WETH9");
      const PositionRenderer = await ethers.getContractFactory("PositionRenderer");
      const PositionDescriptor = await ethers.getContractFactory("PositionDescriptor");
      //const factoryDeploy = (await factoryDeployFactory.deploy())
      //let tx = await factoryDeploy.initialize(factory.address)
      //await tx.wait()
      
      risky_18 = await tokenFactory.deploy('Test Risky 18', 'RISKY18', 18) 
      stable_18 = await tokenFactory.deploy('Test Stable 18', 'STABLE18', 18)
      risky_6 = await tokenFactory.deploy('Test Risky 6', 'RISKY6', 6) 
      stable_6 = await tokenFactory.deploy('Test Stable 6', 'STABLE6', 6) 

      engine_18_18 = await MockEngine.deploy(risky_18.address, stable_18.address, 1, 1, 10^3);
      engine_18_6 = await MockEngine.deploy(risky_18.address, stable_6.address, 1, 10^12, 10^1);
      engine_6_18 = await MockEngine.deploy(risky_6.address, stable_18.address, 10^12, 1, 10^1);
      engine_6_6 = await MockEngine.deploy(risky_6.address, stable_6.address, 10^12, 10^12, 10^1);

      // Deploy PrimitiveManager + dependencies
      positionRenderer = await PositionRenderer.deploy()
      positionDescriptor = await PositionDescriptor.deploy(positionRenderer.address)
      weth9 = await WETH9.deploy()
      manager_18_18 = await PrimitiveManager.deploy(engine_18_18.address, weth9.address, positionDescriptor.address)
      manager_18_6 = await PrimitiveManager.deploy(engine_18_6.address, weth9.address, positionDescriptor.address)
      manager_6_18 = await PrimitiveManager.deploy(engine_6_18.address, weth9.address, positionDescriptor.address)
      manager_6_6 = await PrimitiveManager.deploy(engine_6_6.address, weth9.address, positionDescriptor.address)
      

      console.log(`mockRisky18 ${risky_18.address} mockStable18 ${stable_18.address}`)
      console.log(`mockRisky18 ${risky_6.address} mockStable6 ${stable_6.address}`)
      console.log(`manager_18_18 ${manager_18_18.address}`)
      console.log(`engine_18_18 ${engine_18_18.address}`)
      console.log(`manager_18_6 ${manager_18_6.address}`)
      console.log(`engine_18_6 ${engine_18_6.address}`)
      console.log(`manager_6_18 ${manager_6_18.address}`)
      console.log(`engine_6_18 ${engine_6_18.address}`)
      console.log(`manager_6_6 ${manager_6_6.address}`)
      console.log(`engine_6_6 ${engine_6_6.address}`)

      console.log(`weth9 ${weth9.address}`)

    })

    describe('when the contract is deployed', function () {
      it('has the risky', async function () {
        expect(await engine_18_18.risky()).to.equal(risky_18.address)
      })
    })
  })
//})
