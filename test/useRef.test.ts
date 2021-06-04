import { expect } from 'chai'
import hre from 'hardhat'
import { deployMockContract, MockContract } from 'ethereum-waffle'
import { Wallet, Contract, ethers } from 'ethers'
import { loadFixture } from 'ethereum-waffle'

import { TestRef, TestRef__factory } from '../typechain'

export type UseRefFixture = {
  useRef: TestRef
  signers: Wallet[]
}

export async function useRefFixture(signers: Wallet[]): Promise<UseRefFixture> {
  const [deployer] = signers

  const useRef = await new TestRef__factory(deployer).deploy()

  return {
    useRef,
    signers,
  }
}

describe('useRef', () => {
  let context: UseRefFixture

  beforeEach(async () => {
    context = await loadFixture(useRefFixture)
  })

  describe('stores calldata as a ref', () => {
    it('should set set the owner', async () => {
      const [deployer] = context.signers
      const data = context.useRef.interface.encodeFunctionData('setOwner', [deployer.address])
      await context.useRef.testRef(data)
      expect(await context.useRef.owner1()).to.be.eq(deployer.address)
      expect(await context.useRef.owner()).to.be.eq(ethers.constants.AddressZero)
    })
  })
})
