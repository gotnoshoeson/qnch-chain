# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an EVM-compatible parachain built with the Polkadot SDK (formerly Substrate), based on the Pop CLI EVM parachain template. It integrates Frontier to provide Ethereum Virtual Machine (EVM) compatibility within a Cumulus-based parachain that connects to the Polkadot/Kusama relay chain.

The project uses Polkadot SDK stable2407 branch and Frontier stable2407 branch.

## Pop CLI Installation

```bash
# Install from crates.io
cargo install --force --locked pop-cli

# Verify installation
pop --help
```

## Building the Parachain

### Using Pop CLI (Recommended)

```bash
# Build both runtime and node
pop build

# Build from external directory
pop build --path ./my-appchain

# Build for relay chain registration (generates genesis artifacts)
# Note: Use 'pop build spec' command instead, not --para-id flag
pop build spec --id 2000 --relay paseo-local --genesis-state --genesis-code

# Build in release mode
pop build --release

# Build only the runtime
pop build --only-runtime

# Build runtime deterministically (for reproducible builds)
pop build --deterministic

# Build with benchmarking support
pop build --benchmark
```

### Using Cargo Directly

```bash
# Build the node binary (release mode)
cargo build --release

# Build runtime only
cargo build --release -p parachain-template-runtime

# Build node only
cargo build --release -p parachain-template-node

# The compiled binary will be at: ./target/release/parachain-template-node
```

## Running the Parachain Locally

### Start Local Network

```bash
# Launch network with configuration file (Pop CLI >=0.7.0)
pop up network ./network.toml

# For Pop CLI <0.7.0
pop up parachain -f ./network.toml

# Specify relay chain version
pop up network ./network.toml -r stable2407

# Run with verbose output
pop up network ./network.toml -v

# Auto-confirm binary downloads
pop up network ./network.toml -y

# Run post-startup command
pop up network ./network.toml --cmd ./scripts/setup.sh
```

The `network.toml` file configures:
- Relay chain: paseo-local with 2 validators (alice, bob)
- Parachain ID: 2000
- One collator (collator-01)
- Default command: `./target/release/parachain-template-node`

### Stop/Cleanup Network

```bash
# Stop the running network (in terminal where it's running)
Ctrl+C

# Kill zombienet processes manually (if needed)
pkill -f zombienet

# Clean cached artifacts
pop clean cache
```

### Network Access

After launching, the output shows:
- WebSocket endpoints for each node (typically ws://localhost:9944 for first node)
- Log file locations for debugging
- Connection URLs for Polkadot.js Apps

## Interacting with the Parachain

### Call Chain Functions

```bash
# Interactive mode (guided prompts)
pop call chain

# Direct call with parameters
pop call chain --pallet System --function remark --args "0x11" --url ws://localhost:9944/ --suri //Alice

# Skip confirmation prompt
pop call chain --pallet System --function remark --args "0x11" --url ws://localhost:9944/ --suri //Alice --skip-confirm

# Execute with sudo privileges
pop call chain --pallet System --function remark --args "0x11" --url ws://localhost:9944/ --suri //Alice --sudo

# Use pre-encoded SCALE call data
pop call chain --call 0x00000411 --url ws://localhost:9944/ --suri //Alice
```

### Common Development Accounts

When testing locally, use these built-in dev accounts:
- `//Alice` - Default sudo account
- `//Bob` - Second validator
- `//Charlie`, `//Dave`, `//Eve`, `//Ferdie` - Additional test accounts

## Testing

### Cargo Tests

```bash
# Run all tests
cargo test --workspace

# Run tests for specific package
cargo test -p parachain-template-runtime
cargo test -p parachain-template-node

# Run with features
cargo test --workspace --features runtime-benchmarks

# Run with try-runtime
cargo test --workspace --features try-runtime
```

### Using Pop CLI

```bash
# Run tests
pop test

# Test specific package
pop test --package parachain-template-runtime
```

## EVM/Ethereum Functionality

This parachain includes Frontier for EVM compatibility:

### Ethereum RPC Endpoints

After starting the network, Ethereum RPC is available at:
- HTTP: `http://localhost:8545` (standard Ethereum JSON-RPC)
- WebSocket: `ws://localhost:9944` (Substrate + Ethereum RPC)

### Deploying Smart Contracts

You can use standard Ethereum tools:

```bash
# Using Hardhat, Foundry, or Remix
# Set network RPC to: http://localhost:8545
# Chain ID: Configured in runtime (check EVMChainId pallet)

# Example with cast (from Foundry)
cast send --rpc-url http://localhost:8545 --private-key <key> <contract_address> <function_signature>

# Check balance
cast balance <address> --rpc-url http://localhost:8545
```

### Precompiles

Standard Ethereum precompiles are available at addresses 1-5, plus:
- `0x400` (1024): SHA3FIPS256
- `0x401` (1025): ECRecoverPublicKey

## Benchmarking

```bash
# Benchmark pallets
pop bench --pallet pallet_name

# Generate weights
pop bench --pallet pallet_name --extrinsic '*' --output ./runtime/src/weights/
```

## Cleanup

```bash
# Remove build artifacts
cargo clean

# Clean Pop CLI cache
pop clean cache

# Remove all generated/cached artifacts
pop clean
```

## Code Architecture

### Workspace Structure

- **`runtime/`** - The parachain runtime (state transition function)
  - Core logic that defines how blocks are processed
  - Pallet configurations in `runtime/src/configs/`
  - EVM precompiles in `runtime/src/precompiles.rs`
  - Runtime APIs in `runtime/src/apis.rs`

- **`node/`** - The node binary (client)
  - Block production, networking, RPC
  - Frontier integration in `node/src/eth.rs` and `node/src/rpc/eth.rs`
  - Service configuration in `node/src/service.rs`

### Runtime Architecture (runtime/src/)

The runtime uses the new `#[frame_support::runtime]` macro (not the older `construct_runtime!`) to compose pallets:

**Pallet Organization by Index:**
- 0-9: System pallets (System, ParachainSystem, Timestamp, ParachainInfo)
- 10-14: Monetary (Balances, TransactionPayment)
- 15: Governance (Sudo)
- 20-24: Consensus (Authorship, CollatorSelection, Session, Aura, AuraExt)
- 30-33: XCM (XcmpQueue, PolkadotXcm, CumulusXcm, MessageQueue)
- 40-43: Frontier/EVM (Ethereum, EVM, EVMChainId, BaseFee)

**Key Configurations:**
- Block time: 6 seconds (`MILLISECS_PER_BLOCK`)
- Block weight: 2 seconds of compute with 6-second blocks
- Balance units: UNIT = 100 MILLIUNIT, MILLIUNIT = 1000 MICROUNIT
- Existential deposit: 1 MILLIUNIT
- Forbid EVM reentrancy is enabled

### EVM/Frontier Integration

**Precompiles** (runtime/src/precompiles.rs):
- Standard Ethereum precompiles at addresses 1-5 (ECRecover, SHA256, RIPEMD160, Identity, MODEXP)
- Additional: SHA3FIPS256 (0x400/1024), ECRecoverPublicKey (0x401/1025)

**Transaction Handling** (runtime/src/lib.rs):
- `TransactionConverter` converts Ethereum transactions to runtime extrinsics
- `RuntimeCall` implements `fp_self_contained::SelfContainedCall` for self-contained Ethereum transactions
- Ethereum transactions are processed via `pallet_ethereum::Call::transact`

**Node-Level Frontier** (node/src/):
- `eth.rs` - Frontier backend initialization and database configuration
- `rpc/eth.rs` - Ethereum-compatible RPC endpoints
- `service.rs` - Integration with Cumulus collator service

### XCM Configuration

Located in `runtime/src/configs/xcm.rs`:
- Configures cross-chain message passing
- Defines asset transactors, origin converters, and barrier rules
- Sets up XCMP queue for parachain-to-parachain communication

## Development Workflow

### Adding New Pallets

1. Add dependency to workspace `Cargo.toml` [workspace.dependencies] section
2. Add to `runtime/Cargo.toml` dependencies
3. Add pallet to both `std` and relevant feature flags in `runtime/Cargo.toml`
4. Configure pallet in `runtime/src/configs/mod.rs` (create new file if complex)
5. Add pallet to runtime in `runtime/src/lib.rs` with appropriate `#[runtime::pallet_index(N)]`

### Modifying Runtime

When modifying the runtime:
- Increment `spec_version` in `VERSION` constant (runtime/src/lib.rs:193)
- Update weights if changing extrinsics/logic
- Consider migration code if storage changes

### Adding EVM Precompiles

1. Add precompile dependency to workspace and runtime Cargo.toml
2. Import in `runtime/src/precompiles.rs`
3. Add address to `used_addresses()` array
4. Add match arm in `execute()` and `is_precompile()` methods

## Key Constants

- Block time: 6000ms (6 seconds)
- Slot duration: 6000ms (cannot be changed after chain start)
- Parachain ID: 2000 (configured in network.toml)
- Unincluded segment capacity: 3 blocks
- Block processing velocity: 1 block per relay chain block

## Sudo Account Configuration

**Current Setup (Development):**
- **Sudo account:** `//Alice` (well-known development account)
- **Location:** `node/src/chain_spec.rs` lines 110, 163, 203
- **SS58 Address:** `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
- **Mnemonic:** `bottom drive obey lake curtain smoke basket hold race lonely fit walk`

⚠️ **Development only!** For production/testnet, generate secure accounts:
```bash
subkey generate --scheme sr25519
```

See `SUDO_ACCOUNT_CONFIGURATION.md` for complete production setup guide.

## EVM Deployment Control

This parachain includes `pallet-evm-deployment-control` (pallet index 44) which restricts contract deployments:
- **Only authorized accounts** can deploy contracts directly to the EVM
- **Authorize deployers via sudo:**
  ```bash
  pop call chain \
    --pallet EvmDeploymentControl \
    --function authorize_deployer \
    --args "0xEVMAddressHere" \
    --url ws://localhost:9944 \
    --suri //Alice \
    --sudo
  ```
- **Integration:** `WithdrawOrigin` in pallet_evm uses `EnsureSudoCanDeploy<Runtime>` (runtime/src/deployment_control.rs)
- See `DEPLOYMENT_CONTROL_IMPLEMENTATION.md` for full details

## Smart Contract Deployment

For deploying contracts with Hardhat/Foundry:
- **Use Ethereum JSON-RPC endpoint:** `http://localhost:8545` (NOT ws://localhost:9944)
- **Authorize deployer first** via `EvmDeploymentControl::authorize_deployer`
- See `HARDHAT_DEPLOYMENT_GUIDE.md` for complete setup

## Important Notes

- This parachain requires a relay chain to function (Polkadot, Kusama, or local testnet)
- The runtime is compiled to WebAssembly and uploaded to the relay chain
- Chain spec is defined in `node/src/chain_spec.rs`
- EVM forbids reentrancy - this is a security feature enabled in both pallet_evm and pallet_ethereum
- Pallet organization includes custom pallet at index 44 (EvmDeploymentControl)
