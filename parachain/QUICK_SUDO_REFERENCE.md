# Quick Sudo Account Reference

## Current Setup (Development)

**Location:** `node/src/chain_spec.rs` lines 110, 163, 203

**Sudo Account:** `//Alice` (well-known development account)
- **SS58 Address:** `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
- **Mnemonic:** `bottom drive obey lake curtain smoke basket hold race lonely fit walk`

✅ **Perfect for local testing**
❌ **NEVER use in production!**

## For Paseo Testnet (Future)

### Generate Secure Account
```bash
subkey generate --scheme sr25519
```

Save the output securely:
```
Secret phrase:       [12 words - SAVE THIS!]
Public key (SS58):   5... [This is your account address]
```

### Update Chain Spec

**Option 1: Edit chain_spec.rs**
```rust
let sudo_account = AccountId::from_ss58check("5YourAccountHere...")
    .expect("Valid sudo address");
```

**Option 2: Edit generated JSON**
```bash
pop build spec --id 2000 --relay paseo --type live -o chain-spec.json
# Edit chain-spec.json, find "sudo": { "key": "..." } and replace with your account
```

## Quick Commands

```bash
# Generate secure account
subkey generate --scheme sr25519 > my-sudo-account.txt

# Use sudo with pop call chain
pop call chain --url ws://localhost:9944 --suri "your 12 words here" --sudo

# Change sudo account
pop call chain --pallet Sudo --function set_key --args "5NewAccount..." --sudo
```

See `SUDO_ACCOUNT_CONFIGURATION.md` for complete guide.
