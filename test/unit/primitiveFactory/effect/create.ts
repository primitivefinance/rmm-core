import { waffle } from 'hardhat';
import { expect } from 'chai';
import {
  constants,
} from 'ethers';

import {
  getCreate2Address,
} from '../../../shared/utilities';

import {
  primitiveFactoryFixture,
} from '../../fixtures'

import setupContext from '../../context';

describe('create', function () {
  before(async function () {
    await setupContext(
      waffle.provider,
      primitiveFactoryFixture
    );
  })

  describe('when the parameters are valid', function () {
    it('deploys a new PrimitiveEngine', async function () {
      expect(
        await this.contracts.factory.getEngine(
          this.mocks.risky.address,
          this.mocks.stable.address,
        )
      ).to.equal(constants.AddressZero);

      await this.contracts.factory.create(
        this.mocks.risky.address,
        this.mocks.stable.address,
      );
    });

    it('saves the new engine', async function () {
      expect(
        await this.contracts.factory.getEngine(
          this.mocks.risky.address,
          this.mocks.stable.address,
        )
      ).to.equal(constants.AddressZero);

      const engineAddress = await this.contracts.factory.callStatic.create(
        this.mocks.risky.address,
        this.mocks.stable.address,
      );

      await this.contracts.factory.create(
        this.mocks.risky.address,
        this.mocks.stable.address,
      );

      expect(
        await this.contracts.factory.getEngine(
          this.mocks.risky.address,
          this.mocks.stable.address,
        ),
      ).to.equal(engineAddress);

      expect(
        await this.contracts.factory.getEngine(
          this.mocks.stable.address,
          this.mocks.risky.address,
        ),
      ).to.equal(engineAddress);
    });

    it('emits the EngineCreated event', async function () {
      const [deployer] = this.signers;

      /*
      const poolAddress = getCreate2Address(
        this.contracts.factory.address,
        [
          this.mocks.risky.address,
          this.mocks.stable.address,
        ],
        (await hre.artifacts.readArtifact('PrimitiveEngine')).bytecode,
      );
      */

      const engineAddress = await this.contracts.factory.callStatic.create(
        this.mocks.risky.address,
        this.mocks.stable.address,
      );

      await expect(
        this.contracts.factory.create(
          this.mocks.risky.address,
          this.mocks.stable.address,
        ),
      ).to.emit(this.contracts.factory, 'EngineCreated').withArgs(
        deployer.address,
        this.mocks.risky.address,
        this.mocks.stable.address,
        engineAddress,
      );
    });
  });

  describe('when the parameters are invalid', function () {
    it('reverts when tokens are the same', async function () {
      await expect(
        this.contracts.factory.create(
          this.mocks.risky.address,
          this.mocks.risky.address,
        ),
      ).to.revertedWith('Cannot be same token');
    });

    it('reverts when the risky asset is address 0', async function () {
      await expect(
        this.contracts.factory.create(
          constants.AddressZero,
          this.mocks.stable.address,
        ),
      ).to.revertedWith('Cannot be zero address');
    });

    it('reverts when the stable asset is address 0', async function () {
      await expect(
        this.contracts.factory.create(
          this.mocks.risky.address,
          constants.AddressZero,
        ),
      ).to.revertedWith('Cannot be zero address');
    });
  });
});
