import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-tracer'

export default {
  networks: {
    hardhat: {},
  },
  solidity: { version: '0.8.0', settings: { optimizer: { enabled: true, runs: 400 } } },
}
