# Hardhat Deployment Guide for EVM Parachain

This guide explains how to deploy smart contracts to your EVM parachain using Hardhat.

## Prerequisites

1. **Parachain is built and running**
   ```bash
   pop build --release
   pop up network ./network.toml
   ```

2. **Hardhat project setup** (in a separate directory)
   ```bash
   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
   npx hardhat init
   ```

## Important: Understanding Your Endpoints

Your EVM parachain exposes **two different RPC interfaces**:

### 1. Substrate RPC (WebSocket)
- **Endpoint:** `ws://localhost:9944` (or 9945, 9946 depending on network.toml)
- **Purpose:** Substrate-native operations (governance, staking, sudo calls, etc.)
- **Use with:** Polkadot.js Apps, `pop call chain`, Substrate tools
- ❌ **NOT for Hardhat!**

### 2. Ethereum JSON-RPC (HTTP)
- **Endpoint:** `http://localhost:8545`
- **Purpose:** EVM operations (deploy contracts, call contract functions, send ETH-like txs)
- **Use with:** Hardhat, Foundry, Remix, Metamask, web3.js, ethers.js
- ✅ **USE THIS for Hardhat!**

## Finding Your Ethereum RPC Port

When you run `pop up network ./network.toml`, look for output like:

```
┌───────────────────────────────────────────────────────────┐
│ collator-01: running                                      │
│ ws-port: 9946                                             │
│ rpc-port: 9947                                            │
│ eth-rpc-port: 8545    <--- THIS IS WHAT YOU NEED!       │
└───────────────────────────────────────────────────────────┘
```

The `eth-rpc-port` is your Ethereum JSON-RPC endpoint for Hardhat.

## Hardhat Configuration

Create `hardhat.config.js` in your Hardhat project:

```javascript
require("@nomicfoundation/hardhat-toolbox");

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
    parachain: {
      url: 'http://127.0.0.1:8545',  // Ethereum JSON-RPC endpoint
      chainId: 420,  // Check runtime/src/configs/mod.rs for EVMChainId
      accounts: {
        mnemonic: "bottom drive obey lake curtain smoke basket hold race lonely fit walk"  // //Alice mnemonic
      },
      gas: 12000000,
      gasPrice: 1000000000,  // 1 Gwei
      timeout: 60000,
    },
  },
  mocha: {
    timeout: 60000
  }
};
```

### Important: Find Your Chain ID

Check your runtime configuration:

```bash
grep -n "EVMChainId" runtime/src/configs/mod.rs
```

Or check via Polkadot.js Apps:
1. Connect to `ws://localhost:9944`
2. Developer → Chain State → `evmChainId` → `chainId()`

Update the `chainId` in your Hardhat config to match!

## CRITICAL: Deployment Authorization

Your parachain has the `pallet-evm-deployment-control` installed, which means:

⚠️ **Only authorized accounts can deploy contracts directly!**

### Option 1: Authorize a Deployer Account (Recommended for Testing)

Before deploying with Hardhat, authorize the deployer account:

```bash
# Using pop call chain (interactive)
pop call chain --url ws://localhost:9944 --suri //Alice --sudo

# Then select:
# Pallet: EvmDeploymentControl
# Function: authorize_deployer
# Arguments: <the EVM address of your deployer account>

# Or use direct command:
pop call chain \
  --pallet EvmDeploymentControl \
  --function authorize_deployer \
  --args "0xYourEVMAddressHere" \
  --url ws://localhost:9944 \
  --suri //Alice \
  --sudo
```

**To get the EVM address from a Substrate account:**
```javascript
// In Node.js or Hardhat console
const { ethers } = require("hardhat");
const [deployer] = await ethers.getSigners();
console.log("Deployer address:", deployer.address);
```

### Option 2: Use //Alice as Deployer (Quick Test)

For quick testing, you can:
1. Authorize Alice's EVM address at genesis (modify chain spec)
2. Or authorize it via sudo after network starts
3. Use Alice's mnemonic in Hardhat config

**Alice's well-known mnemonic:**
```
bottom drive obey lake curtain smoke basket hold race lonely fit walk
```

This derives to EVM address: `0xd43593c715fdd31c61141abd04a99fd6822c8558`

Authorize it:
```bash
pop call chain \
  --pallet EvmDeploymentControl \
  --function authorize_deployer \
  --args "0xd43593c715fdd31c61141abd04a99fd6822c8558" \
  --url ws://localhost:9944 \
  --suri //Alice \
  --sudo
```

## Deployment Workflow

### Step 1: Start Your Parachain

```bash
# In your parachain directory
pop build --release
pop up network ./network.toml
```

Wait for the network to be fully running (you'll see block production).

### Step 2: Check Authorization

Verify your deployer is authorized:

```bash
# Query via pop call chain
pop call chain --url ws://localhost:9944
# Select: EvmDeploymentControl → is_authorized_storage → enter your address
```

Or use Polkadot.js Apps:
1. Go to Developer → Chain State
2. Select `evmDeploymentControl` → `authorizedDeployers(AccountId)`
3. Enter your EVM address

If not authorized, authorize it using Option 1 or 2 above!

### Step 3: Deploy Contract with Hardhat

```bash
# In your Hardhat project directory
npx hardhat compile
npx hardhat run scripts/deploy.js --network parachain
```

### Step 4: Verify Deployment

```bash
# Check contract address in Hardhat output
# Then verify via cast (Foundry) or web3
cast code <CONTRACT_ADDRESS> --rpc-url http://localhost:8545
```

## Example Deployment Script

Create `scripts/deploy.js`:

```javascript
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy your contract
  const MyContract = await hre.ethers.getContractFactory("MyContract");
  const myContract = await MyContract.deploy(/* constructor args */);

  await myContract.waitForDeployment();

  console.log("MyContract deployed to:", await myContract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

Run it:
```bash
npx hardhat run scripts/deploy.js --network parachain
```

## Troubleshooting

### ❌ "insufficient funds for gas * price + value"

**Problem:** Deployer account has no balance.

**Solution:** Fund the account. In development, you can:
```bash
# Transfer from Alice (who has funds in genesis) to your deployer
# Use Polkadot.js Apps or pop call chain
```

### ❌ Deployment transaction fails silently

**Problem:** Deployer not authorized in `EvmDeploymentControl` pallet.

**Solution:** Authorize the deployer address (see Option 1 or 2 above).

### ❌ "invalid opcode: PUSH0"

**Problem:** Solidity compiler version too new (0.8.20+ uses PUSH0 which isn't in EVM London).

**Solution:** Use Solidity 0.8.19 or earlier:
```javascript
// hardhat.config.js
solidity: {
  version: "0.8.19",  // or 0.8.17, 0.8.24 should work too
  ...
}
```

### ❌ Cannot connect to endpoint

**Problem:** Wrong port or endpoint not exposed.

**Solutions:**
1. Check the actual port from `pop up network` output
2. Ensure Ethereum RPC is enabled (it should be by default)
3. Try `http://127.0.0.1:8545` instead of `localhost`
4. Check for port conflicts (kill other processes using 8545)

### ❌ "Method not found" errors

**Problem:** Connected to wrong endpoint (Substrate RPC instead of Ethereum RPC).

**Solution:**
- Use `http://localhost:8545` (Ethereum RPC)
- NOT `ws://localhost:9944` (Substrate RPC)

## Checking Chain Configuration

### Get EVM Chain ID

```bash
# Via Polkadot.js
# Developer → Chain State → evmChainId → chainId()

# Or via cast
cast chain-id --rpc-url http://localhost:8545
```

### Check Ethereum RPC is working

```bash
# Get latest block number
cast block-number --rpc-url http://localhost:8545

# Get chain ID
cast chain-id --rpc-url http://localhost:8545

# Check balance
cast balance 0xd43593c715fdd31c61141abd04a99fd6822c8558 --rpc-url http://localhost:8545
```

## Metamask Configuration

To interact with your contracts via Metamask:

1. **Network Name:** My Parachain (or any name)
2. **RPC URL:** `http://localhost:8545`
3. **Chain ID:** Your chain's EVM chain ID (e.g., 420)
4. **Currency Symbol:** Your token symbol (e.g., UNIT)
5. **Block Explorer:** (leave empty for local)

## Summary

✅ **Deploy to:** `http://localhost:8545` (Ethereum JSON-RPC)
✅ **Authorize deployer first** via `EvmDeploymentControl::authorize_deployer`
✅ **Use correct Chain ID** from runtime config
✅ **Fund deployer account** with native tokens

❌ **Don't deploy to:** `ws://localhost:9944` (that's Substrate RPC!)
❌ **Don't skip authorization** (deployment will fail silently!)

Happy deploying! 🚀
