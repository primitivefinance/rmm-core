import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-tracer'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import { HardhatUserConfig } from 'hardhat/config'

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  solidity: {
    version: '0.8.0',
    settings: {
      optimizer: {
        enabled: true,
        runs: 400,
      },
    },
  },
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

export default config
