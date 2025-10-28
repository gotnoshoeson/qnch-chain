# Sudo Account Configuration Guide

## Where the Sudo Account is Set

The sudo account is configured in **`node/src/chain_spec.rs`** in the genesis configuration.

### Current Development Setup

**Line 110** (development_config) and **Line 163** (local_testnet_config):
```rust
get_account_id_from_seed::<sr25519::Public>("Alice")
```

**Line 203** (testnet_genesis function):
```rust
"sudo": { "key": Some(root) }
```

### What This Means

✅ **Yes, you're using a default development account (//Alice)**

The `//Alice` account is a **well-known development account** with:
- **Public address:** `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
- **Mnemonic:** `bottom drive obey lake curtain smoke basket hold race lonely fit walk`
- **Seed:** Derived from the simple string "//Alice"

⚠️ **NEVER use these accounts in production!** Everyone knows the private keys!

## Development vs Production Account Configuration

### Development (Current)
```rust
// node/src/chain_spec.rs - Line 110
get_account_id_from_seed::<sr25519::Public>("Alice")
```

**Pros:**
- Easy to use
- No key management needed
- Works out of the box for testing

**Cons:**
- ❌ Everyone knows the private key
- ❌ Completely insecure
- ❌ Only suitable for local testing

### Production/Testnet (Secure)

For **real deployments** (Paseo, Kusama, Polkadot), you need to:
1. Generate a secure account
2. Back up the mnemonic/seed securely
3. Use that account in your chain spec

## How to Configure Sudo for Production

### Method 1: Direct Chain Spec Modification (Manual)

**Step 1: Generate a Secure Account**

```bash
# Using subkey (install if needed: cargo install --force subkey)
subkey generate --scheme sr25519

# Output will look like:
# Secret phrase:       word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
# Network ID:          substrate
# Secret seed:         0x...
# Public key (hex):    0x...
# Account ID:          0x...
# Public key (SS58):   5... (this is your account address)
# SS58 Address:        5...
```

⚠️ **SAVE THE SECRET PHRASE SECURELY!** You'll need it to access sudo privileges later.

**Step 2: Modify Chain Spec**

Option A: Edit `node/src/chain_spec.rs` directly:

```rust
pub fn production_testnet_config() -> ChainSpec {
    let mut properties = sc_chain_spec::Properties::new();
    properties.insert("tokenSymbol".into(), "UNIT".into());
    properties.insert("tokenDecimals".into(), 12.into());
    properties.insert("ss58Format".into(), 42.into());

    // YOUR SECURE ACCOUNT (from subkey generate)
    let sudo_account = AccountId::from_ss58check("5YourAccountAddressHere...")
        .expect("Valid SS58 address");

    ChainSpec::builder(
        runtime::WASM_BINARY.expect("WASM binary was not built, please build it!"),
        Extensions {
            relay_chain: "paseo".into(),  // Note: "paseo" not "paseo-local" for testnet!
            para_id: 2000,  // Your actual parachain ID
        },
    )
    .with_name("My Parachain Testnet")
    .with_id("my_parachain_testnet")
    .with_chain_type(ChainType::Live)  // Use Live for production
    .with_genesis_config_patch(testnet_genesis(
        // Collators (generate separate keys for each)
        vec![
            (collator1_account, collator1_aura_key),
            (collator2_account, collator2_aura_key),
        ],
        // Endowed accounts (accounts with initial balance)
        vec![
            sudo_account.clone(),
            // Add other accounts that should have tokens
        ],
        sudo_account,  // Sudo account here!
        2000.into(),
    ))
    .with_protocol_id("my-parachain")
    .with_properties(properties)
    .build()
}
```

**Step 3: Build chain spec:**
```bash
pop build --release
./target/release/parachain-template-node build-spec --chain production > chain-spec.json
```

### Method 2: Using Pop Build Spec (Recommended)

This is the **easier and recommended** approach for testnet/production:

**Step 1: Generate Your Secure Account**
```bash
subkey generate --scheme sr25519
# Save the mnemonic and SS58 address!
```

**Step 2: Build Chain Spec with Pop CLI**
```bash
# Generate base spec
pop build spec --id 2000 --relay paseo --type live -o chain-spec.json

# This creates chain-spec.json with placeholder accounts
```

**Step 3: Edit the Generated Chain Spec JSON**
```bash
# Open chain-spec.json and find the sudo section:
"sudo": {
  "key": "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"  // <-- Replace with YOUR account!
}

# Also update balances to give your account tokens:
"balances": {
  "balances": [
    ["5YourAccountAddressHere...", 1000000000000000000]  // Your sudo account
  ]
}
```

**Step 4: Generate Final Chain Spec**
```bash
# Convert to raw format (required for deployment)
./target/release/parachain-template-node build-spec \
  --chain chain-spec.json \
  --raw \
  > chain-spec-raw.json
```

**Step 5: Generate Genesis Artifacts for Relay Registration**
```bash
# This uses your custom chain spec to generate the genesis state and code
pop build spec --chain-spec chain-spec-raw.json --genesis-state --genesis-code
```

## Account Types and Purposes

When setting up for production, you'll need multiple accounts:

| Account Type | Purpose | How Many | Security Level |
|--------------|---------|----------|----------------|
| **Sudo** | Root access, runtime upgrades, emergency actions | 1 (consider multi-sig) | 🔴 CRITICAL |
| **Collators** | Block production, Aura consensus keys | 2-4+ | 🟡 HIGH |
| **Treasury** | Receives fees, funds operations | 1 | 🟡 HIGH |
| **Deployment** | Authorized EVM deployer (optional) | 1+ | 🟢 MEDIUM |

### Generating All Required Accounts

```bash
# Generate sudo account
subkey generate --scheme sr25519 > sudo-account.txt

# Generate collator accounts (you need both AccountId and Aura keys)
subkey generate --scheme sr25519 > collator1-account.txt
subkey generate --scheme sr25519 > collator1-aura.txt

subkey generate --scheme sr25519 > collator2-account.txt
subkey generate --scheme sr25519 > collator2-aura.txt

# Generate deployment authorization account (for EVM deployment control)
subkey generate --scheme sr25519 > deployment-account.txt
```

⚠️ **CRITICAL SECURITY:**
- Store these files in a secure, encrypted location
- Back up offline (multiple copies in different locations)
- Use hardware wallets for production sudo keys
- Consider multi-signature for sudo (upgrade pallet-sudo to pallet-collective)

## Configuring for Paseo Testnet

Here's a complete example for Paseo testnet deployment:

**Option A: Modify chain_spec.rs**

```rust
use sp_core::crypto::Ss58Codec;

pub fn paseo_testnet_config() -> ChainSpec {
    let mut properties = sc_chain_spec::Properties::new();
    properties.insert("tokenSymbol".into(), "UNIT".into());
    properties.insert("tokenDecimals".into(), 12.into());
    properties.insert("ss58Format".into(), 42.into());

    // YOUR ACCOUNTS (replace with your generated accounts)
    let sudo_account = AccountId::from_ss58check("5YourSudoAccountHere...")
        .expect("Valid sudo address");

    let collator1_account = AccountId::from_ss58check("5YourCollator1AccountHere...")
        .expect("Valid collator1 address");
    let collator1_aura = AuraId::from_ss58check("5YourCollator1AuraKeyHere...")
        .expect("Valid aura key");

    let collator2_account = AccountId::from_ss58check("5YourCollator2AccountHere...")
        .expect("Valid collator2 address");
    let collator2_aura = AuraId::from_ss58check("5YourCollator2AuraKeyHere...")
        .expect("Valid aura key");

    ChainSpec::builder(
        runtime::WASM_BINARY.expect("WASM binary was not built, please build it!"),
        Extensions {
            relay_chain: "paseo".into(),  // Paseo testnet relay chain
            para_id: 2000,  // Your assigned parachain ID
        },
    )
    .with_name("My Parachain on Paseo")
    .with_id("my_parachain_paseo")
    .with_chain_type(ChainType::Live)
    .with_genesis_config_patch(testnet_genesis(
        vec![
            (collator1_account.clone(), collator1_aura),
            (collator2_account.clone(), collator2_aura),
        ],
        vec![
            sudo_account.clone(),
            collator1_account,
            collator2_account,
        ],
        sudo_account,
        2000.into(),
    ))
    .with_protocol_id("my-parachain-paseo")
    .with_properties(properties)
    .build()
}
```

**Option B: Using Pop Build Spec + Manual Edit (Easier)**

```bash
# 1. Generate accounts
subkey generate --scheme sr25519  # Save this as your sudo account

# 2. Build initial spec
pop build spec --id 2000 --relay paseo --type live -o paseo-chain-spec.json

# 3. Edit paseo-chain-spec.json
# Replace sudo key with your account
# Replace collator accounts with your accounts
# Add your accounts to balances

# 4. Convert to raw
./target/release/parachain-template-node build-spec \
  --chain paseo-chain-spec.json \
  --raw \
  > paseo-chain-spec-raw.json

# 5. Generate genesis artifacts
pop build spec \
  --chain-spec paseo-chain-spec-raw.json \
  --genesis-state \
  --genesis-code
```

## Using Sudo After Deployment

Once your chain is running with your sudo account, you'll use it like this:

```bash
# Using pop call chain
pop call chain \
  --pallet System \
  --function remark \
  --args "0x48656c6c6f" \
  --url wss://your-parachain-rpc.com \
  --suri "word1 word2 word3 ... word12" \
  --sudo

# Or using Polkadot.js Apps
# 1. Go to https://polkadot.js.org/apps
# 2. Connect to your parachain RPC
# 3. Developer → Extrinsics → sudo → sudo(call)
# 4. Sign with your sudo account
```

## Changing Sudo Account (Runtime Upgrade Required)

To change the sudo account after deployment:

```bash
# Using sudo to set a new sudo key
pop call chain \
  --pallet Sudo \
  --function set_key \
  --args "5NewSudoAccountHere..." \
  --url wss://your-parachain-rpc.com \
  --suri "your current sudo mnemonic" \
  --sudo
```

## Removing Sudo (Production Best Practice)

For true production, you should:

1. **Replace sudo with governance** (pallet-collective, pallet-democracy, OpenGov)
2. **Remove pallet-sudo entirely** via runtime upgrade
3. **Use time-delayed governance** for upgrades

This is a multi-step process requiring:
- Adding governance pallets
- Runtime upgrade to activate governance
- Final runtime upgrade to remove sudo

## Security Checklist for Production

- [ ] Generated all accounts with `subkey generate` (NOT test accounts!)
- [ ] Backed up all mnemonics securely offline (multiple locations)
- [ ] Updated chain spec with production accounts
- [ ] Set `ChainType::Live` (not Development or Local)
- [ ] Changed relay_chain to production network ("paseo", "kusama", "polkadot")
- [ ] Funded sudo and collator accounts with sufficient tokens
- [ ] Tested sudo access before deploying to mainnet
- [ ] Documented account purposes and backup locations
- [ ] Considered multi-sig or hardware wallet for sudo
- [ ] Planned governance migration path

## Quick Reference

### Development (Current)
```rust
// node/src/chain_spec.rs:110
get_account_id_from_seed::<sr25519::Public>("Alice")
```
- ✅ Easy testing
- ❌ Insecure (everyone knows the keys)
- ✅ Good for local development only

### Production (What You'll Need)
```bash
# Generate secure account
subkey generate --scheme sr25519

# Use the SS58 address in chain spec
AccountId::from_ss58check("5YourSecureAddressHere...")
```
- ✅ Secure (only you know the keys)
- ✅ Required for testnet/mainnet
- ⚠️ Must back up mnemonic securely!

## Next Steps for You

1. **For now (development):** Keep using //Alice, it's perfect for local testing
2. **Before Paseo testnet:**
   - Generate a secure sudo account with `subkey`
   - Back up the mnemonic securely
   - Update your chain spec with the new account
   - Test locally first with the new account
3. **Before mainnet:**
   - Use hardware wallet or multi-sig for sudo
   - Plan governance migration
   - Security audit

Need help with any of these steps? Let me know! 🚀
