# Deployment Control Testing Script

This script tests the EVM Deployment Control pallet functionality by:

1. **Deriving H160 addresses** from the test mnemonic
2. **Authorizing Account 0** for contract deployment using sudo
3. **Deploying a contract** with the authorized account (should succeed)
4. **Attempting to deploy** with an unauthorized account (should fail)

## Prerequisites

1. **Parachain running** with EVM Deployment Control pallet
   - WebSocket endpoint: `ws://127.0.0.1:45843` (or update in script)
   - Sudo enabled with Alice account

2. **Accounts funded** with native tokens
   - Run `yarn fund` first to fund the test accounts
   - Account 0 needs enough balance for gas fees

3. **Dependencies installed**
   ```bash
   yarn install
   ```

## Usage

Run the test script:

```bash
yarn test-deployment
```

Or directly with Hardhat:

```bash
npx hardhat run scripts/test-deployment-control.ts
```

## Configuration

The script uses these settings from `hardhat.config.ts`:

- **Network**: `qnch` (configured for localhost:8545)
- **Mnemonic**: `test test test test test test test test test test test junk`
- **Accounts**: Generates 10 accounts from the mnemonic

### Updating the WebSocket Endpoint

If your parachain runs on a different port, update the constant in the script:

```typescript
const WS_ENDPOINT = 'ws://127.0.0.1:45843';  // Change this
```

## Test Accounts

The script derives accounts using the same derivation path as Hardhat:

```
m/44'/60'/0'/0/0  → Account 0 (will be authorized)
m/44'/60'/0'/0/1  → Account 1 (will NOT be authorized)
```

## Expected Behavior

### Step 1: Authorization

```
✅ Account 0 is now authorized!
```

The script uses `sudo.sudo(evmDeploymentControl.authorizeDeployer(...))` to add Account 0 to the whitelist.

### Step 2: Authorized Deployment

```
✅ SUCCESS! Contract deployed at: 0x...
```

Account 0 should successfully deploy the Counter contract.

### Step 3: Unauthorized Deployment

```
✅ EXPECTED FAILURE! Deployment was rejected.
```

Account 1 should fail to deploy because it's not authorized.

## Troubleshooting

### "Transaction sent but no finalization"

- The script waits 12 seconds for finalization
- If your parachain has slower block times, increase the timeout:

```typescript
setTimeout(() => resolve(); }, 12000);  // Increase this
```

### "Deployment succeeded with unauthorized account"

This means the deployment control is not properly configured. Check:

1. **Runtime integration**: Verify `RestrictedDeployment` is configured in `runtime/src/lib.rs`
2. **EVM config**: Ensure `pallet_evm` uses the `OnCreate` filter
3. **Pallet is running**: Query the storage to verify the pallet is active

### "Account 0 authorization status unclear"

Wait a bit longer and manually check authorization:

```bash
# Using polkadot.js
api.query.evmDeploymentControl.authorizedDeployers(accountAddress)
```

## Contract Details

The test deploys the **Counter.sol** contract:

```solidity
contract Counter {
  uint public x;
  function inc() public { x++; }
  function incBy(uint by) public { x += by; }
}
```

This is a simple contract to minimize gas costs during testing.

## Script Output

The script provides detailed output:

```
🚀 Testing EVM Deployment Control

📡 Connecting to ws://127.0.0.1:45843...
✅ Connected to QnchChain

👤 Sudo Account: Alice (0x...)

🔑 Deriving Hardhat accounts from mnemonic...

Test Accounts:
  Account 0: 0x...
  Account 1: 0x...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: Authorize Account 0 for deployment
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Authorizing: 0x...
  📤 Submitting sudo transaction...
  ✅ Transaction sent: 0x...
  ✅ Account 0 is now authorized!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: Deploy with AUTHORIZED Account 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Compiling contracts...
✅ Contracts compiled

📦 Contract bytecode length: ...

🚀 Deploying Counter contract with Account 0...
  📋 Deployer address: 0x...
  📤 Deployment transaction: 0x...
  ⏳ Waiting for transaction receipt...
  ✅ SUCCESS! Contract deployed at: 0x...
  📊 Gas used: ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: Deploy with UNAUTHORIZED Account 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 Attempting to deploy Counter with Account 1...
  ⚠️  This SHOULD FAIL because Account 1 is not authorized

  📋 Deployer address: 0x...
  ✅ EXPECTED FAILURE! Deployment was rejected.
  📋 Error: ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Test complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Next Steps

After verifying deployment control works:

1. **Test revocation**: Create a script to test `revoke_deployer`
2. **Test factory contracts**: Verify authorized accounts can deploy factories
3. **Integration tests**: Add automated tests using Hardhat's test framework
4. **Governance**: Test authorization via governance (not just sudo)

## Related Scripts

- `fund-accounts.ts`: Fund the test accounts with native tokens
- `send-op-tx.ts`: Send optimism-style transactions

## Documentation References

- [Deployment Control Implementation](../DEPLOYMENT_CONTROL_IMPLEMENTATION.md)
- [Hardhat Deployment Guide](../HARDHAT_DEPLOYMENT_GUIDE.md)
- [Sudo Account Configuration](../SUDO_ACCOUNT_CONFIGURATION.md)
