# QNCH Chain

A Polkadot EVM parachain with deployment control, built for the Polkadot hackathon.

## Overview

QNCH Chain is a Polkadot parachain that integrates the EVM (Ethereum Virtual Machine) with a custom deployment control mechanism. The chain enforces that only authorized accounts can deploy smart contracts directly, while regular users must deploy through approved factory contracts.

## Project Structure

```
qnch-chain/
├── parachain/              # Polkadot parachain (built with Pop CLI)
│   ├── pallets/           # Custom pallets
│   │   └── evm-deployment-control/  # Deployment authorization pallet
│   ├── runtime/           # Parachain runtime configuration
│   ├── node/              # Node implementation
│   └── binaries/          # Relay chain binaries (gitignored)
├── contracts/             # Hardhat environment for EVM contracts
│   ├── contracts/         # Solidity smart contracts
│   ├── scripts/           # Deployment and testing scripts
│   └── test/              # Contract tests
├── docs/                  # Project documentation
│   ├── hackathon-rules.md
│   ├── DOT_EVM_PARACHAIN_SCOPING.md
│   └── DEPLOYMENT_CONTROL_IMPLEMENTATION.md
└── .claude/               # Claude Code configuration
    └── agents/            # Specialized AI agents for development
```

## Features

### 1. EVM Deployment Control Pallet

A custom Substrate pallet that:
- Maintains a whitelist of authorized deployers
- Integrates with `pallet-evm` to enforce deployment restrictions
- Provides sudo/governance-controlled authorization management
- Emits events for all authorization changes

### 2. EVM Integration

- Full Ethereum compatibility via `pallet-evm`
- Support for standard Ethereum tools (Hardhat, MetaMask, etc.)
- H160 account format for seamless Ethereum integration

### 3. Pop CLI Based

Built using [Pop CLI](https://github.com/r0gue-io/pop-cli) for:
- Rapid parachain development
- Simplified runtime configuration
- Easy local testnet deployment

## Quick Start

### Prerequisites

- **Rust**: Latest stable version
- **Pop CLI**: `cargo install --git https://github.com/r0gue-io/pop-cli`
- **Node.js**: v18+ and Yarn
- **Polkadot.js Apps**: For interacting with the chain

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo>
   cd qnch-chain
   ```

2. **Install contract dependencies**:
   ```bash
   yarn install:contracts
   ```

3. **Build the parachain**:
   ```bash
   # Development build (faster)
   yarn build:parachain:dev

   # Production build (optimized)
   yarn build:parachain
   ```

### Running the Parachain

**Start the local development network**:
```bash
yarn start:dev
```

This will:
- Download the Paseo relay chain binary (if needed)
- Start a local relay chain
- Launch the parachain
- Connect them together

The parachain will be available at:
- **RPC**: `http://localhost:8545` (EVM JSON-RPC)
- **WebSocket**: `ws://localhost:9944` (Substrate)

### Funding Test Accounts

Fund the Hardhat test accounts with native tokens:

```bash
yarn fund
```

This derives 10 accounts from the test mnemonic and funds them using Alice's account.

### Testing Deployment Control

Run the deployment control test:

```bash
yarn test
```

This script:
1. Authorizes Account 0 for deployment
2. Deploys a contract with the authorized account (✅ should succeed)
3. Attempts deployment with unauthorized account (❌ should fail)

## Development Workflows

### Working with the Parachain

```bash
# Check Rust code
yarn check:parachain

# Run tests
yarn test:parachain

# Format code
yarn format:parachain

# Run clippy
yarn clippy:parachain

# Clean build artifacts
yarn clean:parachain
```

### Working with Contracts

```bash
# Compile contracts
yarn compile:contracts

# Run tests
cd contracts && yarn test

# Deploy contracts
cd contracts && npx hardhat run scripts/deploy.ts --network qnch

# Clean artifacts
yarn clean:contracts
```

## Key Components

### EVM Deployment Control Pallet

Located in `parachain/pallets/evm-deployment-control/`:

**Extrinsics**:
- `authorize_deployer(deployer)` - Authorize an account (requires Root)
- `revoke_deployer(deployer)` - Revoke authorization (requires Root)

**Storage**:
- `AuthorizedDeployers` - Map of authorized deployer accounts

**Query**:
- `is_authorized(account)` - Check if account is authorized

### Runtime Integration

The pallet is integrated into the runtime via a custom `OnCreate` implementation that checks authorization before allowing contract deployments.

See `parachain/runtime/src/lib.rs` for the full configuration.

### Test Accounts

The project uses the standard Hardhat test mnemonic:
```
test test test test test test test test test test test junk
```

**Derived accounts** (using `m/44'/60'/0'/0/i`):
- Account 0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Account 1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- ... (10 accounts total)

## Documentation

Detailed documentation is available in the `docs/` directory:

- **[Hackathon Rules](docs/hackathon-rules.md)** - Competition guidelines and requirements
- **[Scoping Document](docs/DOT_EVM_PARACHAIN_SCOPING.md)** - Project scope and design decisions
- **[Implementation Guide](docs/DEPLOYMENT_CONTROL_IMPLEMENTATION.md)** - Technical implementation details

## Hardhat Configuration

The Hardhat environment (`contracts/`) is configured to connect to the local parachain:

```typescript
networks: {
  qnch: {
    url: "http://localhost:8545",
    accounts: {
      mnemonic: "test test test test test test test test test test test junk",
      count: 10
    }
  }
}
```

## Sudo Account

The parachain uses Alice as the sudo account for development:

```
Seed: 0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a
Address: 0xd43593c715fdd31c61141abd04a99fd6822c8558
```

Use Alice to call sudo operations like authorizing deployers.

## Scripts

### Contracts Scripts

Located in `contracts/scripts/`:

- **`fund-accounts.ts`** - Fund Hardhat accounts from Alice
- **`test-deployment-control.ts`** - Test deployment authorization
- **`send-op-tx.ts`** - Send optimism-style transactions

Run with:
```bash
cd contracts && npx hardhat run scripts/<script-name>.ts --network qnch
```

## Troubleshooting

### Parachain won't start

1. Check if relay chain binary is downloaded: `ls parachain/binaries/`
2. Try cleaning and rebuilding: `yarn clean:parachain && yarn build:parachain:dev`
3. Check ports 8545, 9944, and 9933 are available

### Contract deployment fails

1. Ensure parachain is running: `curl http://localhost:8545`
2. Check accounts are funded: `yarn fund`
3. Verify authorization if using deployment control

### Build errors

1. Update Rust: `rustup update`
2. Clean and rebuild: `yarn clean:parachain && yarn build:parachain:dev`
3. Check Cargo.lock is present

## Contributing

This project was built for the Polkadot hackathon. For development questions, see the `.claude/agents/` directory for specialized AI agent configurations.

## License

MIT License - see LICENSE file for details

## Resources

- [Polkadot Documentation](https://docs.polkadot.com)
- [Pop CLI](https://github.com/r0gue-io/pop-cli)
- [pallet-evm](https://github.com/polkadot-evm/frontier)
- [Hardhat](https://hardhat.org)

## Acknowledgments

Built using:
- Polkadot SDK
- Pop CLI
- Frontier (EVM pallet)
- Hardhat
