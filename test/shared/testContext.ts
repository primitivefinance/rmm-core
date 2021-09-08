import { ethers, waffle } from 'hardhat'
import { Signer } from '@ethersproject/abstract-signer'
import { Wallet } from '@ethersproject/wallet'
import { Contracts } from '../../types'

const { createFixtureLoader } = waffle

export function testContext(description: string, hooks: () => void): void {
  describe(description, function () {
    before(async function () {
      this.contracts = {} as Contracts
      this.signers = await waffle.provider.getWallets()
      this.loadFixture = createFixtureLoader(this.signers)
    })

    hooks()
  })
}
