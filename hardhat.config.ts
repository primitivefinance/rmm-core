import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'

export default {
  networks: {
    hardhat: {},
  },
  solidity: { version: '0.7.3', settings: { optimizer: { enabled: true, runs: 400 } } },
}
