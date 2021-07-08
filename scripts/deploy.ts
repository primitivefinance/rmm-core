import hre from 'hardhat'

import {
  PrimitiveFactory__factory,
  TestToken__factory,
} from '../typechain'

async function main() {
  console.log('\n\n#-----------------------------------------------------#\n')
  console.log('Deploying to network:', hre.network.name)

  const [deployer] = await hre.ethers.getSigners()
  console.log('Using wallet:', deployer.address)

  const factory = await new PrimitiveFactory__factory(deployer).deploy()
  await factory.deployed()

  console.log('\n    - Primitive Factory deployed to:', factory.address)

  const dai = await new TestToken__factory(deployer).deploy('DAI', 'DAI', 18)
  await dai.deployed()

  console.log('    - DAI deployed to:', dai.address)

  const weth = await new TestToken__factory(deployer).deploy('WETH', 'Wrapped Ether', 18)
  await weth.deployed()

  console.log('    - WETH deployed to:', weth.address)

  console.log('\n#-----------------------------------------------------#\n\n')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
