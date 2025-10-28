require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // Local development network (Zombienet)
    parachain_local: {
      url: 'http://127.0.0.1:8545',  // Ethereum JSON-RPC endpoint
      chainId: 420,  // Check your runtime's EVMChainId pallet for the actual value
      accounts: {
        // IMPORTANT: This must be an AUTHORIZED deployer account!
        // For testing, you can use a dev account, but you'll need to authorize it first via sudo
        mnemonic: "bottom drive obey lake curtain smoke basket hold race lonely fit walk"  // //Alice
      },
      gas: 12000000,
      gasPrice: 1000000000,  // 1 Gwei
      timeout: 60000,
    },

    // If you need to connect to a specific collator port (when running multiple parachains)
    parachain_local_alt: {
      url: 'http://127.0.0.1:8546',  // Alternative port if default is taken
      chainId: 420,
      accounts: {
        mnemonic: "bottom drive obey lake curtain smoke basket hold race lonely fit walk"
      },
      gas: 12000000,
      gasPrice: 1000000000,
    },
  },

  // Mocha test timeout
  mocha: {
    timeout: 60000
  }
};
