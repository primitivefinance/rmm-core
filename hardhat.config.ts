import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-gas-reporter'
import { HardhatUserConfig } from 'hardhat/config'
import '@primitivefi/hardhat-dodoc'
import '@nomiclabs/hardhat-etherscan'

import { resolve } from 'path'
import { config as dotenvConfig } from 'dotenv'
import { NetworkUserConfig } from 'hardhat/types'
dotenvConfig({ path: resolve(__dirname, './.env') })

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''
const INFURA_API_KEY = process.env.INFURA_API_KEY || ''

const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
}

function createTestnetConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string = 'https://' + network + '.infura.io/v3/' + INFURA_API_KEY
  return {
    accounts: {
      count: 10,
      initialIndex: 0,
      mnemonic: 'test test test test test test',
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[network],
    url,
  }
}

const config: HardhatUserConfig = {
  dodoc: {
    runOnCompile: false,
    templatePath: './docusaurus.sqrl',
    outputDir: 'docs',
    exclude: ['crytic', 'libraries', 'test', 'console'],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    dev: {
      chainId: 1337,
      url: 'http://127.0.0.1:8545',
      blockGasLimit: 12e6,
      gas: 12e6,
    },
    mainnet: createTestnetConfig('mainnet'),
    rinkeby: createTestnetConfig('rinkeby'),
  },
  mocha: {
    timeout: 1000000,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  solidity: {
    version: '0.8.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      metadata: {
        bytecodeHash: 'none',
      },
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 100,
    enabled: true,
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
}

export default config
