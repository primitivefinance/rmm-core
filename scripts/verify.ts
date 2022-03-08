import hre from 'hardhat'

async function main() {
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
