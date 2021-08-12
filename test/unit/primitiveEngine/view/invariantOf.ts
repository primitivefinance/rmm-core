import expect from '../../../shared/expect'
import { constants } from 'ethers'
import { waffle } from 'hardhat'
import loadContext from '../../context'
import { Calibration, computePoolId } from '../../../shared'
import { parseWei, Time } from 'web3-units'

describe('invariantOf', function () {
  before(async function () {
    loadContext(waffle.provider, ['engineCreate', 'engineSwap'])
  })

  it('does not revert if expired', async function () {
    const cal = new Calibration(10, 1, 1, 0, 10)
    const account = this.signers[0].address
    await this.contracts.risky.mint(account, parseWei('1000').raw)
    await this.contracts.stable.mint(account, parseWei('1000').raw)
    await this.contracts.engineCreate.create(
      cal.strike.raw,
      cal.sigma.raw,
      cal.maturity.raw,
      parseWei(cal.delta).raw,
      parseWei('1').raw,
      constants.HashZero
    )
    await this.contracts.engine.advanceTime(10)
    const poolId = computePoolId(this.contracts.engine.address, cal.maturity.raw, cal.sigma.raw, cal.strike.raw)
    await this.contracts.engineSwap.swap(poolId, true, 2000, false, constants.HashZero)
    await expect(this.contracts.engine.invariantOf(poolId)).to.not.be.reverted
  })
})
