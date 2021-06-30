import { waffle } from 'hardhat'
import { expect } from 'chai'
import { constants, BytesLike } from 'ethers'

import { allocateFragment } from '../fragments'

import loadContext, { config } from '../../context'

const { strike, sigma, time, spot } = config
const empty: BytesLike = constants.HashZero

describe('reentrancy', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineDeposit', 'engineAllocate'], allocateFragment)
  })

  describe('calls allocate on the reserve through the callback data', function () {
    it('allocates enough stable and risky for 1 LP share from margin', async function () {})
  })
})
