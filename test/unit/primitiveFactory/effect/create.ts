import { expect } from 'chai';
import {
  loadFixture,
} from 'ethereum-waffle';
import {
  constants,
} from 'ethers';

import {
  primitiveFactoryFixture,
  PrimitiveFactoryFixture,
} from '../../fixtures';

import {
  getCreate2Address,
} from '../../../shared/utilities';

import bytecode from '../bytecode';

describe('create', () => {
  let context: PrimitiveFactoryFixture;

  beforeEach(async () => {
    context = await loadFixture(primitiveFactoryFixture);
  });

  describe('when the parameters are valid', () => {
    it('deploys a new PrimitiveEngine', async () => {
      await context.primitiveFactory.create(
        context.risky.address,
        context.stable.address,
      );
    });

    it('saves the new engine', async () => {
      const engineAddress = await context.primitiveFactory.callStatic.create(
        context.risky.address,
        context.stable.address,
      );

      await context.primitiveFactory.create(
        context.risky.address,
        context.stable.address,
      );

      expect(
        await context.primitiveFactory.getEngine(
          context.risky.address,
          context.stable.address,
        ),
      ).to.equal(engineAddress);

      expect(
        await context.primitiveFactory.getEngine(
          context.stable.address,
          context.risky.address,
        ),
      ).to.equal(engineAddress);
    });

    it('emits the EngineCreated event', async () => {
      const [deployer] = context.signers;

      const poolAddress = getCreate2Address(
        context.primitiveFactory.address,
        [
          context.risky.address,
          context.stable.address,
        ],
        bytecode,
      );

      await expect(
        context.primitiveFactory.create(
          context.risky.address,
          context.stable.address,
        ),
      ).to.emit(context.primitiveFactory, 'EngineCreated').withArgs(
        deployer.address,
        context.risky.address,
        context.stable.address,
        poolAddress,
      );
    });
  });

  describe('when the parameters are invalid', () => {
    it('reverts when tokens are the same', async () => {
      await expect(
        context.primitiveFactory.create(
          context.risky.address,
          context.risky.address,
        ),
      ).to.revertedWith('Cannot be same token');
    });

    it('reverts when the risky asset is address 0', async () => {
      await expect(
        context.primitiveFactory.create(
          constants.AddressZero,
          context.stable.address,
        ),
      ).to.revertedWith('Cannot be zero address');
    });

    it('reverts when the stable asset is address 0', async () => {
      await expect(
        context.primitiveFactory.create(
          context.risky.address,
          constants.AddressZero,
        ),
      ).to.revertedWith('Cannot be zero address');
    });
  });
});
