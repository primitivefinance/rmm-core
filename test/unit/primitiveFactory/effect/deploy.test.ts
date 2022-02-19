import { ethers } from 'hardhat'
import { constants, Wallet } from 'ethers'
import { createFixtureLoader, deployMockContract } from 'ethereum-waffle'

import expect from '../../.../../../shared/expect'
import { computeEngineAddress } from '../../../shared'
import { testContext } from '../../.../../../shared/testContext'
import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { engineFixture } from '../../.../../../shared/fixtures'
import { usePool, useLiquidity, useTokens, useApproveAll } from '../../.../../../shared/hooks'

import { abi as TestToken } from '../../../../artifacts/contracts/test/TestToken.sol/TestToken.json'
import { bytecode } from '../../../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

TestPools.forEach(function (pool: PoolState) {
  testContext(`deploy engines`, function () {
    const { decimalsRisky, decimalsStable } = pool.calibration

    let loadFixture: ReturnType<typeof createFixtureLoader>
    let signer: Wallet, other: Wallet
    before(async function () {
      ;[signer, other] = await (ethers as any).getSigners()
      loadFixture = createFixtureLoader([signer, other])
    })

    beforeEach(async function () {
      const fixture = await loadFixture(engineFixture)
      const { factory, factoryDeploy, router } = fixture
      const { engine, risky, stable } = await fixture.createEngine(decimalsRisky, decimalsStable)
      this.contracts = { factory, factoryDeploy, router, engine, risky, stable }
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      await usePool(this.signers[0], this.contracts, pool.calibration)
      await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address)
    })

    describe('when the parameters are valid', function () {
      let deployer

      beforeEach(async function () {
        deployer = this.signers[0]
      })

      it('deploys a new PrimitiveEngine', async function () {
        let mockRisky = await deployMockContract(deployer, TestToken)
        let mockStable = await deployMockContract(deployer, TestToken)
        await mockRisky.mock.decimals.returns(18)
        await mockStable.mock.decimals.returns(18)
        expect(await this.contracts.factory.getEngine(mockRisky.address, mockStable.address)).to.equal(
          constants.AddressZero
        )
        await this.contracts.factoryDeploy.deploy(mockRisky.address, mockStable.address)
      })

      it('emits the DeployEngine event', async function () {
        const [deployer] = this.signers

        let mockRisky = await deployMockContract(deployer, TestToken)
        let mockStable = await deployMockContract(deployer, TestToken)
        await mockRisky.mock.decimals.returns(18)
        await mockStable.mock.decimals.returns(18)
        const engineAddress = computeEngineAddress(
          this.contracts.factory.address,
          mockRisky.address,
          mockStable.address,
          bytecode
        )

        await expect(this.contracts.factoryDeploy.deploy(mockRisky.address, mockStable.address))
          .to.emit(this.contracts.factory, 'DeployEngine')
          .withArgs(this.contracts.factoryDeploy.address, mockRisky.address, mockStable.address, engineAddress)
      })
    })

    describe('when the parameters are invalid', function () {
      it('reverts when tokens are the same', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(this.contracts.risky.address, this.contracts.risky.address)
        ).to.be.revertedWith('SameTokenError()')
      })

      it('reverts when the risky asset is address 0', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(constants.AddressZero, this.contracts.stable.address)
        ).to.be.revertedWith('ZeroAddressError()')
      })

      it('reverts when the stable asset is address 0', async function () {
        await expect(
          this.contracts.factoryDeploy.deploy(this.contracts.risky.address, constants.AddressZero)
        ).to.be.revertedWith('ZeroAddressError()')
      })
    })
  })
})
