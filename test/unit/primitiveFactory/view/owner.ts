import { expect } from 'chai';
import {
  loadFixture,
} from 'ethereum-waffle';

import {
  primitiveFactoryFixture,
  PrimitiveFactoryFixture,
} from '../../fixtures';

describe('owner', () => {
  let context: PrimitiveFactoryFixture;

  beforeEach(async () => {
    context = await loadFixture(primitiveFactoryFixture);
  });

  it('returns the deployer of the contract as the owner', async () => {
    const [deployer] = context.signers;

    expect(
      await context.primitiveFactory.owner(),
    ).to.equal(deployer.address);
  });
});
