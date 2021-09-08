import expect from '../../.../../../shared/expect'
import { waffle } from 'hardhat'
import { constants } from 'ethers'
import { parseWei, Time } from 'web3-units'

import { PoolState, TestPools } from '../../.../../../shared/poolConfigs'
import { computePoolId, computePositionId } from '../../.../../../shared/utils'
import { primitiveFixture } from '../../.../../../shared/fixtures'
import { testContext } from '../../.../../../shared/testContext'
import { usePool, useLiquidity, useTokens, useApproveAll, useMargin } from '../../.../../../shared/hooks'
const { HashZero } = constants

import { deployMockContract } from 'ethereum-waffle'
import { abi as TestToken } from '../../../../artifacts/contracts/test/TestToken.sol/TestToken.json'
import { bytecode } from '../../../../artifacts/contracts/test/engine/MockEngine.sol/MockEngine.json'

import { computeEngineAddress } from '../../../shared'

TestPools.forEach(function (pool: PoolState) {
  testContext(`deploy engines`, function () {
    const { strike, sigma, maturity, lastTimestamp, delta } = pool.calibration
    let poolId: string, posId: string

    beforeEach(async function () {
      const fixture = await this.loadFixture(primitiveFixture)
      this.contracts = fixture.contracts
      await useTokens(this.signers[0], this.contracts, pool.calibration)
      await useApproveAll(this.signers[0], this.contracts)
      ;({ poolId } = await usePool(this.signers[0], this.contracts, pool.calibration))
      ;({ posId } = await useLiquidity(this.signers[0], this.contracts, pool.calibration, this.contracts.router.address))
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
        expect(await this.contracts.factory.getEngine(mockRisky.address, mockStable.address)).to.equal(constants.AddressZero)
        await this.contracts.factoryDeploy.deploy(mockRisky.address, mockStable.address)
      })

      it('emits the Deployed event', async function () {
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
          .to.emit(this.contracts.factory, 'Deployed')
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
