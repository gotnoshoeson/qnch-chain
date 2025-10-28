# Deployment Control Implementation Guide

## Overview

This guide provides the complete implementation for restricting smart contract deployment to only the sudo account on your EVM parachain. Users can only deploy contracts through your ProxyFactory contract, not directly.

---

## Architecture

```
User Wallet (0x123...)
    │
    ├─ Try direct deployment → ❌ BLOCKED (not sudo)
    │
    └─ Call ProxyFactory.cloneContract()
           │
           └─ Factory deploys → ✅ ALLOWED (factory is sudo)
```

---

## Implementation Approach

Since you're using the **OpenZeppelin EVM template** with **H160 addresses**, the sudo account will be an Ethereum address (20 bytes).

### Step 1: Create Custom EnsureOrigin Implementation

**File**: `runtime/src/deployment_control.rs` (create this file in your OpenZeppelin template runtime)

```rust
use frame_support::{
    traits::EnsureOrigin,
    pallet_prelude::*,
};
use sp_std::marker::PhantomData;

/// Ensures only sudo can perform contract deployments
pub struct EnsureSudoCanDeploy<T>(PhantomData<T>);

impl<T> EnsureOrigin<T::RuntimeOrigin> for EnsureSudoCanDeploy<T>
where
    T: frame_system::Config + pallet_sudo::Config,
{
    type Success = T::AccountId;

    fn try_origin(origin: T::RuntimeOrigin) -> Result<Self::Success, T::RuntimeOrigin> {
        // Extract the account from the origin
        let who = frame_system::ensure_signed(origin.clone())?;

        // Get the sudo account
        let sudo_account = pallet_sudo::Pallet::<T>::key()
            .ok_or(origin.clone())?;

        // Check if caller is sudo
        if who == sudo_account {
            Ok(who) // ✅ Sudo can deploy
        } else {
            Err(origin) // ❌ Non-sudo cannot deploy
        }
    }
}
```

**How it works**:
1. `ensure_signed()` extracts the account that signed the transaction
2. `pallet_sudo::Pallet::<T>::key()` gets the current sudo account
3. If they match → deployment allowed
4. If they don't match → deployment rejected

---

### Step 2: Add Module Declaration

**File**: `runtime/src/lib.rs`

Add this near the top of your runtime file:

```rust
// After other module declarations
mod deployment_control;
pub use deployment_control::*;
```

---

### Step 3: Configure pallet-revive (or pallet-evm)

**File**: `runtime/src/lib.rs`

Find your EVM pallet configuration and modify it:

#### If using pallet-revive:

```rust
impl pallet_revive::Config for Runtime {
    type AddressMapper = H160Mapper<Self>; // Use H160 for Ethereum addresses
    type ChainId = ConstU64<42069>; // Your chain ID
    type Balance = Balance;
    type Currency = Balances;
    type NativeToEthRatio = ConstU32<1_000_000>;
    type AllowEVMBytecode = ConstBool<true>;

    // Anyone can upload bytecode (or restrict this too)
    type UploadOrigin = EnsureSigned<Self::AccountId>;

    // 🔥 KEY CHANGE: Only sudo can deploy contracts
    type InstantiateOrigin = EnsureSudoCanDeploy<Self>;

    type Time = Timestamp;
    type FeeInfo = (); // Or your fee configuration
}
```

#### If using pallet-evm (Frontier):

```rust
impl pallet_evm::Config for Runtime {
    type FeeCalculator = BaseFee;
    type GasWeightMapping = pallet_evm::FixedGasWeightMapping<Self>;
    type WeightPerGas = WeightPerGas;
    type BlockHashMapping = pallet_ethereum::EthereumBlockHashMapping<Self>;

    type CallOrigin = EnsureAddressRoot<AccountId>; // Anyone can call contracts

    // 🔥 KEY CHANGE: Only sudo can deploy contracts
    type WithdrawOrigin = EnsureSudoCanDeploy<Self>;

    type AddressMapping = pallet_evm::HashedAddressMapping<BlakeTwo256>;
    type Currency = Balances;
    type RuntimeEvent = RuntimeEvent;
    type PrecompilesType = (); // Or your precompiles
    type PrecompilesValue = ();
    type ChainId = ConstU64<42069>;
    type BlockGasLimit = BlockGasLimit;
    type Runner = pallet_evm::runner::stack::Runner<Self>;
    type OnChargeTransaction = ();
    type OnCreate = ();
    type FindAuthor = ();
    type GasLimitPovSizeRatio = GasLimitPovSizeRatio;
    type Timestamp = Timestamp;
    type WeightInfo = pallet_evm::weights::SubstrateWeight<Self>;
}
```

---

### Step 4: Set Sudo Account in Genesis

**File**: `node/src/chain_spec.rs` or genesis configuration

```rust
use sp_core::H160;

fn testnet_genesis(
    sudo_account: H160, // Ethereum address for sudo
    endowed_accounts: Vec<H160>,
    id: ParaId,
) -> serde_json::Value {
    serde_json::json!({
        "sudo": {
            "key": Some(sudo_account) // Your Metamask address
        },
        "balances": {
            "balances": endowed_accounts
                .iter()
                .cloned()
                .map(|k| (k, 1_000_000_000_000_000_000u128)) // 1 token
                .collect::<Vec<_>>()
        },
        // ... other pallets
    })
}
```

**Example**:
```rust
// Your Metamask address as sudo
let sudo = H160::from_str("0xYourMetamaskAddressHere").unwrap();
testnet_genesis(sudo, vec![sudo], 2000.into())
```

---

## Deployment Scripts

### Hardhat Configuration

**File**: `packages/hardhat/hardhat.config.js`

Add your parachain network:

```javascript
module.exports = {
  solidity: "0.8.17",
  networks: {
    // Existing networks...
    moonbase: { ... },

    // Your parachain (local development)
    parachain_local: {
      url: 'http://127.0.0.1:9944', // Your parachain RPC
      chainId: 42069, // Your chain ID
      accounts: {
        // IMPORTANT: This must be the SUDO account
        mnemonic: "your sudo account mnemonic here"
      },
      gasPrice: 1000000000, // 1 Gwei
    },

    // Your parachain (testnet)
    parachain_testnet: {
      url: 'https://your-parachain-rpc.com',
      chainId: 42069,
      accounts: {
        mnemonic: "your sudo account mnemonic here"
      }
    }
  },
  // ... rest of config
};
```

---

### Deployment Script for Factory

**File**: `packages/hardhat/scripts/deploy-factory.js`

```javascript
const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("==================================================");
  console.log("Deploying FanSociety contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("==================================================\n");

  // 1. Deploy Implementation
  console.log("📝 Deploying FanSocietyV1 implementation...");
  const FanSocietyV1 = await ethers.getContractFactory("FanSocietyV1");
  const implementation = await FanSocietyV1.deploy();
  await implementation.waitForDeployment();
  const implAddress = await implementation.getAddress();
  console.log("✅ Implementation deployed:", implAddress);

  // 2. Deploy Beacon
  console.log("\n📝 Deploying FSBeacon...");
  const FSBeacon = await ethers.getContractFactory("FSBeacon");
  const beacon = await FSBeacon.deploy(implAddress, deployer.address);
  await beacon.waitForDeployment();
  const beaconAddress = await beacon.getAddress();
  console.log("✅ Beacon deployed:", beaconAddress);
  console.log("   Implementation set to:", await beacon.implementation());

  // 3. Deploy Factory
  console.log("\n📝 Deploying ProxyFactory...");
  const ProxyFactory = await ethers.getContractFactory("ProxyFactory");
  const factory = await ProxyFactory.deploy(beaconAddress, deployer.address);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ Factory deployed:", factoryAddress);

  // 4. Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      FanSocietyV1: {
        address: implAddress,
        txHash: implementation.deploymentTransaction().hash
      },
      FSBeacon: {
        address: beaconAddress,
        txHash: beacon.deploymentTransaction().hash
      },
      ProxyFactory: {
        address: factoryAddress,
        txHash: factory.deploymentTransaction().hash
      }
    }
  };

  // Save to file
  const deploymentsDir = "./deployments";
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `${deploymentsDir}/${deploymentInfo.chainId}_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n==================================================");
  console.log("📋 Deployment Summary");
  console.log("==================================================");
  console.log("Implementation:", implAddress);
  console.log("Beacon:", beaconAddress);
  console.log("Factory:", factoryAddress);
  console.log("\nDeployment info saved to:", filename);
  console.log("==================================================");

  // 5. Update Next.js constants (instructions)
  console.log("\n📝 Next Steps:");
  console.log("1. Update your Next.js constants.js:");
  console.log(`   FACTORY_ADDRESS = "${factoryAddress}"`);
  console.log(`   BEACON_ADDRESS = "${beaconAddress}"`);
  console.log(`   IMPLEMENTATION_ADDRESS = "${implAddress}"`);
  console.log("\n2. Export ABIs:");
  console.log("   yarn hardhat export --export-all ../react-app/contracts/hardhat_contracts.json");
  console.log("\n3. Test deployment restriction:");
  console.log("   node scripts/test-deployment-control.js");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

**Run it**:
```bash
cd packages/hardhat
npx hardhat run scripts/deploy-factory.js --network parachain_local
```

---

### Testing Script: Verify Deployment Control

**File**: `packages/hardhat/scripts/test-deployment-control.js`

```javascript
const { ethers } = require("hardhat");

async function main() {
  const [sudo, regularUser] = await ethers.getSigners();

  console.log("==================================================");
  console.log("🧪 Testing Deployment Control");
  console.log("==================================================");
  console.log("Sudo account:", sudo.address);
  console.log("Regular user:", regularUser.address);
  console.log("==================================================\n");

  // Simple test contract
  const testContractBytecode = "0x608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fea2646970667358221220e4a1b0a5a8c4e6f3a2d1c8b5f6e3c2d9a8b7c6e5f4d3c2b1a09f8e7d6c5b4a363736c6f6c63430008110033";

  // Test 1: Sudo deploys directly (should succeed)
  console.log("✅ Test 1: Sudo deploying contract directly...");
  try {
    const tx1 = await sudo.sendTransaction({
      data: testContractBytecode,
      gasLimit: 3000000
    });
    const receipt1 = await tx1.wait();
    console.log("   SUCCESS: Contract deployed at", receipt1.contractAddress);
    console.log("   Tx hash:", receipt1.hash);
  } catch (error) {
    console.log("   ❌ FAILED (unexpected):", error.message);
  }

  console.log("\n");

  // Test 2: Regular user deploys directly (should fail)
  console.log("❌ Test 2: Regular user deploying contract directly...");
  try {
    const tx2 = await regularUser.sendTransaction({
      data: testContractBytecode,
      gasLimit: 3000000
    });
    const receipt2 = await tx2.wait();
    console.log("   ❌ ERROR: Regular user should NOT be able to deploy!");
    console.log("   Contract deployed at", receipt2.contractAddress);
  } catch (error) {
    console.log("   ✅ SUCCESS: Deployment blocked as expected");
    console.log("   Error:", error.message);
  }

  console.log("\n");

  // Test 3: Regular user deploys via factory (should succeed)
  console.log("✅ Test 3: Regular user deploying via factory...");

  const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x..."; // From deployment

  if (FACTORY_ADDRESS === "0x...") {
    console.log("   ⚠️  SKIPPED: Set FACTORY_ADDRESS environment variable");
    console.log("   Example: FACTORY_ADDRESS=0x1234... node scripts/test-deployment-control.js");
  } else {
    try {
      const factory = await ethers.getContractAt("ProxyFactory", FACTORY_ADDRESS, regularUser);

      // Call cloneContract() (might need to send value if cloneContractCost > 0)
      const cloneCost = await factory.cloneContractCost();
      const tx3 = await factory.cloneContract({ value: cloneCost });
      const receipt3 = await tx3.wait();

      // Get deployed proxy address
      const userClone = await factory.fanClubs(regularUser.address);

      console.log("   ✅ SUCCESS: Proxy deployed via factory");
      console.log("   Proxy address:", userClone);
      console.log("   Tx hash:", receipt3.hash);
    } catch (error) {
      console.log("   ❌ FAILED:", error.message);
    }
  }

  console.log("\n==================================================");
  console.log("✅ Testing Complete");
  console.log("==================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

**Run it**:
```bash
# After deploying factory
export FACTORY_ADDRESS=0xYourFactoryAddress
npx hardhat run scripts/test-deployment-control.js --network parachain_local
```

---

## Setup Instructions

### 1. Clone OpenZeppelin Template

```bash
cd /home/liminal/code
git clone https://github.com/OpenZeppelin/polkadot-runtime-templates.git
cd polkadot-runtime-templates/evm-runtime-template
```

### 2. Add Deployment Control

Create the files mentioned above:
- `runtime/src/deployment_control.rs`
- Update `runtime/src/lib.rs`
- Update pallet configuration

### 3. Build Runtime

```bash
cargo build --release
```

### 4. Generate Chain Spec

```bash
./target/release/node-template build-spec --chain local > chain-spec.json

# Edit chain-spec.json to set your sudo address
# Look for "sudo": { "key": "..." }

# Convert to raw format
./target/release/node-template build-spec --chain chain-spec.json --raw > chain-spec-raw.json
```

### 5. Run Your Parachain

```bash
# Local development
./target/release/node-template --dev --rpc-cors all --rpc-methods=unsafe --rpc-external

# Or with custom chain spec
./target/release/node-template \
  --base-path /tmp/parachain \
  --chain chain-spec-raw.json \
  --rpc-cors all \
  --rpc-methods=unsafe \
  --rpc-external \
  --rpc-port 9944
```

### 6. Deploy Your Contracts

```bash
cd /home/liminal/code/fs/packages/hardhat

# Deploy to your parachain
npx hardhat run scripts/deploy-factory.js --network parachain_local
```

### 7. Test Deployment Control

```bash
# Test that only sudo can deploy
export FACTORY_ADDRESS=0xYourFactoryAddressFromDeployment
npx hardhat run scripts/test-deployment-control.js --network parachain_local
```

---

## Important Notes

### Sudo Account Management

**Your sudo account (Metamask address) MUST**:
1. Have sufficient balance for gas
2. Be the deployer in Hardhat config
3. Match the sudo key in chain spec

**Example**:
```javascript
// hardhat.config.js
accounts: {
  mnemonic: "your twelve word seed phrase here" // Must generate your sudo address
}
```

**To get address from mnemonic**:
```javascript
const { ethers } = require("ethers");
const mnemonic = "your twelve word seed phrase";
const wallet = ethers.Wallet.fromPhrase(mnemonic);
console.log("Address:", wallet.address); // Use this as sudo in chain spec
```

---

### Factory Contract Deployment

**After deploying factory**:

1. The factory contract address IS whitelisted (because it was deployed by sudo)
2. Factory CAN deploy proxy contracts (internal contract creation)
3. Regular users CANNOT deploy directly
4. Regular users CAN call `factory.cloneContract()` which deploys for them

**Important**: The `InstantiateOrigin` check only applies to **top-level deployments** (transactions with empty `to` field). When a contract (like your factory) internally creates another contract, that bypasses the origin check. This is expected behavior!

---

### Contract-to-Contract Deployment

From the Polkadot SDK documentation:

> "This [InstantiateOrigin] is not enforced when a contract instantiates another contract."

This means:
- ✅ Your factory CAN deploy proxies (internal CREATE)
- ✅ Proxies CAN create other contracts if needed
- ❌ Users CANNOT deploy contracts directly (external CREATE)

If you need to restrict contract-to-contract deployment too, you'd need to:
1. Also restrict `UploadOrigin` to validate bytecode
2. Or modify factory contract to only deploy approved templates

---

## Troubleshooting

### Issue: "Origin not allowed to instantiate"

**Cause**: Non-sudo account trying to deploy

**Solution**: This is expected! Only sudo can deploy directly. Users must use the factory.

---

### Issue: Factory deployment fails

**Possible causes**:
1. Sudo account doesn't have balance → Fund sudo account
2. Factory not deployed by sudo → Use sudo account in Hardhat
3. Gas limit too low → Increase gas limit in Hardhat config

---

### Issue: "Transaction reverted"

**Debug steps**:
1. Check sudo account has balance: `npx hardhat balance --account 0xYourSudoAddress --network parachain_local`
2. Verify sudo in chain spec matches deployer: Check `chain-spec.json` sudo key
3. Check EVM logs: Enable `--log runtime::evm=debug` on your node

---

## Next Steps

After verifying deployment control works:

1. ✅ Deploy to testnet (same process, different RPC)
2. ✅ Update Next.js constants with new contract addresses
3. ✅ Test full flow: Connect wallet → Deploy via factory → Create fan pin
4. ✅ Document for hackathon judges
5. ✅ Record demo video showing deployment restriction

---

## Summary

**What you've implemented**:
- ✅ Only sudo (your Metamask address) can deploy contracts directly
- ✅ ProxyFactory contract deployed by sudo
- ✅ Users can deploy proxies via factory
- ✅ Users CANNOT deploy contracts directly
- ✅ Clean, maintainable Substrate pattern

**Files created**:
- `runtime/src/deployment_control.rs` - Custom EnsureOrigin
- `scripts/deploy-factory.js` - Hardhat deployment script
- `scripts/test-deployment-control.js` - Verification script

**Estimated implementation time**: 4-6 hours (including testing)

**Ready for hackathon**: Yes! This demonstrates advanced Substrate customization.
