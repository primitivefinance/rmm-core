import hre from 'hardhat'

import { PrimitiveFactory__factory } from '../typechain'

async function main() {
  console.log('\n\n#-----------------------------------------------------#\n')
  console.log('Deploying to network:', hre.network.name)

  const [deployer] = await hre.ethers.getSigners()
  console.log('Using wallet:', deployer.address)

  const factory = await new PrimitiveFactory__factory(deployer).deploy()
  await factory.deployed()

  console.log('\nPrimitive Factory deployed to:', factory.address)
  console.log('\n#-----------------------------------------------------#\n\n')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
