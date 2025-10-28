# Fund Accounts Script

This script funds the 10 Hardhat-derived Ethereum accounts with native tokens from Alice's account on your Polkadot parachain.

## How it works

1. Derives 10 Ethereum addresses from the Hardhat mnemonic (`test test test test test test test test test test test junk`)
2. Uses Alice's known test account as the funder
3. Sends tokens to each of the 10 derived accounts
4. Displays the final balances

## Prerequisites

- Your Polkadot parachain node must be running at `ws://127.0.0.1:9944` (or update `WS_ENDPOINT` in the script)
- Alice's account must have sufficient balance to fund all 10 accounts

## Configuration

You can modify these constants in `fund-accounts.ts`:

- `WS_ENDPOINT`: WebSocket endpoint of your parachain (default: `ws://127.0.0.1:9944`)
- `FUNDING_AMOUNT`: Amount to send to each account (default: `1000000000000000`)
- `HARDHAT_MNEMONIC`: The mnemonic from hardhat.config.ts (already set)
- `ACCOUNT_COUNT`: Number of accounts to fund (default: 10)

## Running the script

```bash
npx ts-node scripts/fund-accounts.ts
```

Or with yarn:

```bash
yarn ts-node scripts/fund-accounts.ts
```

## Expected output

```
🚀 Starting funding script for Hardhat accounts...

📡 Connecting to ws://127.0.0.1:9944...
✅ Connected to [Your Chain Name]
💰 Token: [TOKEN], Decimals: [DECIMALS]

👤 Funder: Alice (0x...)

💵 Alice's balance: [BALANCE] [TOKEN]

🔑 Deriving Hardhat accounts from mnemonic...

Accounts to fund:
  0: 0x...
  1: 0x...
  ...

💸 Starting transfers...

  📤 Funding Account 0 (0x...)...
  ✅ Transaction sent: 0x...
  ...

⏳ Waiting for transactions to be finalized...

📊 Final balances:

  Account 0: [BALANCE] [TOKEN]
  Account 1: [BALANCE] [TOKEN]
  ...

✨ Funding complete!
```

## Notes

- The script uses Alice's known test account private key
- The 10 accounts are derived using the standard Ethereum derivation path: `m/44'/60'/0'/0/i`
- These are the same accounts that Hardhat uses when you connect to the network
