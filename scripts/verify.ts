import hre from 'hardhat'
import { Contract } from 'ethers'
import { getAddress } from 'ethers/lib/utils'

async function main() {
  const [signer] = await hre.ethers.getSigners()

  const abi = ['function WETH9() public view returns (address)']
  const addresses = {
    primitiveFactory: '0xBCB72cC1b2Afd9462722eA7f698Bf66e0A78c534',
    positionRenderer: '0xF0b3b8Cba38Cc4628ddcfac98FFE2249575d459e',
    positionDescriptor: '0x1e2CD4F4a2B156e1cB5a0869B812D116aBc9d7A0',
    primitiveManager: '0x3662c4eCb5b3b0805C8Af689D664796Dc74fAB94',
    upgradeableProxy: '0x2dCfd996a459AA0e699522c9F49f6d33a8066e1e',
  }
  const manager = new Contract(addresses.primitiveManager, abi, signer)

  await hre.run('verify:verify', {
    address: '0x5e202B4760D5d29Fb176256B8Ca8e20B703d3606',
    constructorArguments: [],
  })
  console.log('Verified Engine')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
