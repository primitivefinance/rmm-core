import { expect } from 'chai';
import {
  loadFixture,
} from 'ethereum-waffle';

import {
  primitiveFactoryFixture,
  PrimitiveFactoryFixture,
} from '../../fixtures';

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

    it.skip('emits the EngineCreated event', async () => {
      const [deployer] = context.signers;

      await expect(
        context.primitiveFactory.create(
          context.risky.address,
          context.stable.address,
        ),
      ).to.emit(context.primitiveFactory, 'EngineCreated').withArgs(
        deployer.address,
        context.risky.address,
        context.stable.address,
        '',
      );
    });
  });
});
