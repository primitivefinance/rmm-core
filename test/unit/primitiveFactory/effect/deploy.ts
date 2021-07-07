import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import loadContext from '../../context'
import { deployMockContract } from 'ethereum-waffle'
import { abi as Token } from '../../../../artifacts/contracts/test/Token.sol/Token.json'

describe('deploy', function () {
  before(async function () {
    loadContext(waffle.provider, ['factoryDeploy'], async () => {})
  })

  describe('when the parameters are valid', function () {
    let deployer
    beforeEach(async function () {
      deployer = this.signers[0]
    })
    it('deploys a new PrimitiveEngine', async function () {
      let mockRisky = await deployMockContract(deployer, Token)
      let mockStable = await deployMockContract(deployer, Token)
      expect(await this.contracts.factory.getEngine(mockRisky.address, mockStable.address)).to.equal(constants.AddressZero)
      await this.contracts.factoryDeploy.deploy(mockRisky.address, mockStable.address)
    })

    it('emits the Deployed event', async function () {
      const [deployer] = this.signers

      /*
      const poolAddress = getCreate2Address(
        this.contracts.factory.address,
        [
          this.contracts.risky.address,
          this.contracts.stable.address,
        ],
        (await hre.artifacts.readArtifact('PrimitiveEngine')).bytecode,
      );
      */

      let mockRisky = await deployMockContract(deployer, Token)
      let mockStable = await deployMockContract(deployer, Token)
      const engineAddress = await this.contracts.factory.callStatic.deploy(mockRisky.address, mockStable.address)

      await expect(this.contracts.factoryDeploy.deploy(mockRisky.address, mockStable.address))
        .to.emit(this.contracts.factory, 'Deployed')
        .withArgs(this.contracts.factoryDeploy.address, mockRisky.address, mockStable.address, engineAddress)
    })
  })

  describe('when the parameters are invalid', function () {
    it('reverts when tokens are the same', async function () {
      await expect(
        this.contracts.factoryDeploy.deploy(this.contracts.risky.address, this.contracts.risky.address)
      ).to.revertedWith('Cannot be same token')
    })

    it('reverts when the risky asset is address 0', async function () {
      await expect(
        this.contracts.factoryDeploy.deploy(constants.AddressZero, this.contracts.stable.address)
      ).to.revertedWith('Cannot be zero address')
    })

    it('reverts when the stable asset is address 0', async function () {
      await expect(this.contracts.factoryDeploy.deploy(this.contracts.risky.address, constants.AddressZero)).to.revertedWith(
        'Cannot be zero address'
      )
    })
  })
})
