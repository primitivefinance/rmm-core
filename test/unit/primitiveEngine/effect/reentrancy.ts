import { waffle } from 'hardhat'
import { expect } from 'chai'
import { BigNumber, constants, BytesLike } from 'ethers'

import { parseWei, PERCENTAGE } from '../../../shared/Units'

import { allocateFragment } from '../fragments'

import loadContext from '../../context'

const [strike, sigma, time, _] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600, parseWei('1100').raw]
const empty: BytesLike = constants.HashZero

describe('reentrancy', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate'], allocateFragment)
  })

  describe('calls allocate on the reserve through the callback data', function () {
    it('allocates enough stable and risky for 1 LP share from margin', async function () {})
  })
})
