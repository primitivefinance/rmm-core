import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-tracer'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import 'hardhat-contract-sizer'
import { HardhatUserConfig } from 'hardhat/config'
import * as dotenv from 'dotenv'

dotenv.config()

const { ARBITRUM_PRIVATE_KEY } = process.env

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    arbitrumTestnet: {
      accounts: [ARBITRUM_PRIVATE_KEY],
      url: 'https://rinkeby.arbitrum.io/rpc',
      chainId: 421611,
      gasPrice: 0,
    },
    arbitrum: {
      url: 'https://arb1.arbitrum.io/rpc',
      chainId: 42161,
    },
  },
  solidity: {
    version: '0.8.0',
    settings: {
      optimizer: {
        enabled: true,
        runs: 100,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: true,
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}

export default config
