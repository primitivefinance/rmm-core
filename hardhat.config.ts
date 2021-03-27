import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'

export default {
  networks: {
    hardhat: {},
  },
  solidity: { version: '0.7.6', settings: { optimizer: { enabled: true, runs: 400 } } },
}
