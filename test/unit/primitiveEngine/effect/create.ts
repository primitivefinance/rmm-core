import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants } from 'ethers'
import hre from 'hardhat'

import { parseWei, PERCENTAGE } from '../../../shared/Units'
import { loadContext } from '../../context'

import * as ContractTypes from '../../../../typechain'

const [strike, sigma, time, spot] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]

describe('create', function () {
  let engineAddress: string;

  before(async function () {
    await loadContext(
      waffle.provider,
      ['factory', 'engineCreate', 'risky', 'stable'],
      async (signers, contracts) => {
        await contracts.factory.create(contracts.risky.address, contracts.stable.address)
        engineAddress = await contracts.factory.getEngine(contracts.risky.address, contracts.stable.address)

        await contracts.stable.mint(signers[0].address, constants.MaxUint256)
        await contracts.risky.mint(signers[0].address, constants.MaxUint256)
        await contracts.stable.approve(contracts.engineCreate.address, constants.MaxUint256)
        await contracts.risky.approve(contracts.engineCreate.address, constants.MaxUint256)

        contracts.engine = await hre.ethers.getContractAt('PrimitiveEngine', engineAddress) as ContractTypes.PrimitiveEngine
      },
    );
  });

  describe('when the parameters are valid', function () {
    it('deploys a new pool', async function () {
      await this.contracts.engineCreate.create(
        engineAddress,
        this.contracts.risky.address,
        this.contracts.stable.address,
        strike,
        sigma,
        time,
        spot,
      );
    })

    it('emits the Create event', async function () {
      await expect(
        this.contracts.engineCreate.create(
          engineAddress,
          this.contracts.risky.address,
          this.contracts.stable.address,
          strike,
          sigma,
          time,
          spot,
        )
      ).to.emit(this.contracts.engine, 'Create').withArgs(
        this.contracts.engineCreate.address,
        '0x779eb7e81ac17d5ef91f938add39a20c598fbbb64275a3d4df6d6c2f3e03947c',
        strike,
        sigma,
        time
      )
    })

    it('reverts when the pool already exists', async function () {
      await this.contracts.engineCreate.create(
        engineAddress,
        this.contracts.risky.address,
        this.contracts.stable.address,
        strike,
        sigma,
        time,
        spot,
      );
      await expect(
        this.contracts.engineCreate.create(
          engineAddress,
          this.contracts.risky.address,
          this.contracts.stable.address,
          strike,
          sigma,
          time,
          spot,
        )
      ).to.be.revertedWith('Already created')
    })
  })
})
