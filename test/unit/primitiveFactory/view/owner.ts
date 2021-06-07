import { waffle } from 'hardhat'
import { expect } from 'chai';

import setupContext from '../../context';
import {
  primitiveFactoryFixture,
} from '../../fixtures'

describe('owner', async function () {
  before(async function () {
    await setupContext(
      waffle.provider,
      primitiveFactoryFixture,
    );
  });

  it('returns the deployer of the contract as the owner', async function () {
    const [deployer] = this.signers;

    expect(
      await this.contracts.factory.owner(),
    ).to.equal(deployer.address);
  });
});
