import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'

import loadContext from '../../context'
import { deployMockContract } from 'ethereum-waffle'
import { abi as Token } from '../../../../artifacts/contracts/test/Token.sol/Token.json'

describe('create', function () {
  before(async function () {
    await loadContext(waffle.provider, ['factoryCreate'], async () => {})
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
      await this.contracts.factoryCreate.create(mockRisky.address, mockStable.address)
    })

    it('emits the EngineCreated event', async function () {
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
      const engineAddress = await this.contracts.factory.callStatic.create(mockRisky.address, mockStable.address)

      await expect(this.contracts.factoryCreate.create(mockRisky.address, mockStable.address))
        .to.emit(this.contracts.factory, 'EngineCreated')
        .withArgs(this.contracts.factoryCreate.address, mockRisky.address, mockStable.address, engineAddress)
    })
  })

  describe('when the parameters are invalid', function () {
    it('reverts when tokens are the same', async function () {
      await expect(
        this.contracts.factoryCreate.create(this.contracts.risky.address, this.contracts.risky.address)
      ).to.revertedWith('Cannot be same token')
    })

    it('reverts when the risky asset is address 0', async function () {
      await expect(
        this.contracts.factoryCreate.create(constants.AddressZero, this.contracts.stable.address)
      ).to.revertedWith('Cannot be zero address')
    })

    it('reverts when the stable asset is address 0', async function () {
      await expect(this.contracts.factoryCreate.create(this.contracts.risky.address, constants.AddressZero)).to.revertedWith(
        'Cannot be zero address'
      )
    })
  })
})
