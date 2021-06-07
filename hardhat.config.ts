import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-tracer'
import 'hardhat-gas-reporter'
import 'solidity-coverage'

export default {
  networks: {
    hardhat: {},
  },
  solidity: { version: '0.8.0', settings: { optimizer: { enabled: true, runs: 400 } } },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}
