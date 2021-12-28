import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'prettier-plugin-solidity'
import 'hardhat-gas-reporter'
import { HardhatUserConfig } from 'hardhat/config'
import '@primitivefi/hardhat-dodoc'

const config: HardhatUserConfig = {
  dodoc: {
    runOnCompile: true,
    outputDir: 'docs',
    templatePath: './docusaurus.sqrl',
    include: [
      'PrimitiveEngine',
      'PrimitiveFactory',
      'IPrimitiveEngine',
      'IPrimitiveFactory',
      'IPrimitiveCreateCallback',
      'IPrimitiveDepositCallback',
      'IPrimitiveLiquidityCallback',
      'IPrimitiveSwapCallback',
      'IPrimitiveEngineActions',
      'IPrimitiveEngineErrors',
      'IPrimitiveEngineEvents',
      'IPrimitiveEngineView',
      'CumulativeNormalDistribution',
      'Margin',
      'ReplicationMath',
      'Reserve',
      'SafeCast',
      'Transfers',
      'Units'
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  mocha: {
    timeout: 1000000,
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
