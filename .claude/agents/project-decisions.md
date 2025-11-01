---
name: project-decisions
description: Records all key decisions made during project planning. Use this to quickly recall what was decided and why.
tools:
  - Read
---

# Project Decisions Log

## Session Date: October 27, 2025 (Updated)

### Key Decisions Made

#### 1. Template Choice
**Decision**: Use Pop CLI-based EVM Parachain Template
**Rationale**:
- Modern, actively maintained tooling
- Frontier pallets pre-configured (pallet-evm + pallet-ethereum)
- Rapid development with `pop` commands
- Cumulus parachain framework built-in
- H160 EVM address support out-of-the-box
- Polkadot SDK stable2407 + Frontier stable2407

**Location**: `/home/liminal/code/qnch-chain/parachain/`

**Why Pop CLI**: Faster setup than building from scratch, includes best practices, excellent documentation, active community support

---

#### 2. Deployment Control Approach
**Decision**: Custom Pallet + Runtime Integration (Two-Layer Approach)
**Implementation**:
- **Layer 1**: Custom pallet `pallet-evm-deployment-control` (pallet index 44)
  - Storage: `AuthorizedDeployers` map
  - Extrinsics: `authorize_deployer`, `revoke_deployer` (Root origin required)
  - Query function: `is_authorized(account)`
- **Layer 2**: Runtime-level enforcement via `EnsureSudoCanDeploy<Runtime>`
  - Located in `runtime/src/deployment_control.rs`
  - Integrated with pallet-evm's `WithdrawOrigin` type
  - Checks authorization before allowing contract creation

**Why**: Maximum security, demonstrates advanced Substrate capabilities, maintainable, follows best practices

**Rejected Alternatives**:
- Simple EnsureOrigin only (less flexible for future expansion)
- Precompile-based (too complex for hackathon timeline)
- Transaction filter (less elegant, harder to audit)

**Implementation Guide**: `/home/liminal/code/qnch-chain/parachain/DEPLOYMENT_CONTROL_IMPLEMENTATION.md`

---

#### 3. Sudo Address Type
**Decision**: SS58 format (Substrate standard), with //Alice for development
**Development Sudo Account**: `//Alice`
- SS58 Address: `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY`
- Mnemonic: `bottom drive obey lake curtain smoke basket hold race lonely fit walk`

**Why**: Pop CLI template uses standard Substrate addresses, secure for production with proper key generation

**EVM Interaction**: For EVM operations, accounts are converted to H160 format internally by Frontier pallets

**Configuration**:
```rust
// Chain spec (node/src/chain_spec.rs)
sudo: Some(SudoConfig {
    key: Some(get_account_id_from_seed::<sr25519::Public>("Alice")),
})
```

⚠️ **Production**: Generate new keys with `subkey generate --scheme sr25519`

---

#### 4. Factory Whitelisting Strategy
**Decision**: Runtime-level restriction (sudo only), NOT smart contract level

**How it works**:
- Users CAN call factory externally (blockchain level)
- Users WON'T see in Next.js app (application level)
- Only factory contract (deployed by sudo) can deploy proxies
- Factory contract itself was deployed by sudo

**Why**: Maximum security, demonstrates advanced Substrate capabilities

---

#### 5. Token Economics
**Decision**: Parachain native token + DOT fee payment (NOT full DOT-native)

**Rationale**:
- Full DOT-native requires complex XCM setup (2-3 weeks)
- Parachain token + asset conversion is faster (1 week)
- Still impressive for hackathon judges
- Can upgrade to full DOT-native post-hackathon

**Trade-off**: Less innovative but more deliverable

---

#### 6. Frontend Changes
**Decision**: NO changes to Next.js app code

**What YOU will update** (after deployment):
- `constants.js` - Add parachain network config
- `constants.js` - Update `CHAIN` to point to new contracts
- Hardhat auto-exports ABIs to frontend

**Estimated effort**: 30 minutes

---

#### 7. Hackathon Theme
**Decision**: "Building a blockchain"

**Why**: Perfect fit for parachain infrastructure project

**Positioning**: Enterprise-grade controlled blockchain infrastructure

**Target Audience**: Enterprises, DAOs, regulated industries

---

#### 8. Timeline Approach
**Decision**: 6-week phased approach (not 10-16 weeks)

**Why**: You already have:
- ✅ Factory contract (done)
- ✅ Next.js frontend (done)
- ✅ Backend service (done)

**Savings**: ~30-40 hours from original estimate

**Internal Deadline**: November 16 (submit 24 hours early)

---

#### 9. Video Demo Strategy
**Decision**: YES, create 3-4 minute video

**Why**:
- Judges may not run code
- Video is primary evaluation for many
- Shows it actually works

**Content**:
- Working demo (first 90 seconds)
- Architecture explanation
- Use case & impact

---

## Implementation Status

### Completed (As of October 27, 2025)
- ✅ Set up Pop CLI-based parachain project
- ✅ Integrated Frontier pallets (EVM support)
- ✅ Created custom `pallet-evm-deployment-control`
- ✅ Implemented runtime-level enforcement (`EnsureSudoCanDeploy`)
- ✅ Configured Cumulus parachain framework
- ✅ Set up Hardhat development environment
- ✅ Created comprehensive documentation:
  - DEPLOYMENT_CONTROL_IMPLEMENTATION.md
  - HARDHAT_DEPLOYMENT_GUIDE.md
  - SUDO_ACCOUNT_CONFIGURATION.md
  - CLAUDE.md (Pop CLI guide)
  - QUICK_SUDO_REFERENCE.md
- ✅ Configured monorepo build system
- ✅ Added workspace npm scripts
- ✅ Created specialized AI agents

### Current Tasks (Phase 3: Testing)
- [ ] Build parachain in release mode
- [ ] Launch local network with relay chain
- [ ] Test EVM JSON-RPC endpoints
- [ ] Fund test accounts
- [ ] Test deployment authorization flow
- [ ] Deploy and test contracts via Hardhat
- [ ] End-to-end integration testing

### Upcoming (Phase 4: Submission)
- [ ] Create demo video
- [ ] Final documentation polish
- [ ] Submit to hackathon

---

## Important Files Reference

**Monorepo Root**:
`/home/liminal/code/qnch-chain/`

**Parachain**:
`/home/liminal/code/qnch-chain/parachain/`

**Custom Pallet**:
`/home/liminal/code/qnch-chain/parachain/pallets/evm-deployment-control/src/lib.rs`

**Runtime**:
`/home/liminal/code/qnch-chain/parachain/runtime/src/lib.rs`
`/home/liminal/code/qnch-chain/parachain/runtime/src/deployment_control.rs`

**Hardhat**:
`/home/liminal/code/qnch-chain/contracts/`

**Documentation**:
`/home/liminal/code/qnch-chain/docs/`
`/home/liminal/code/qnch-chain/parachain/CLAUDE.md`
`/home/liminal/code/qnch-chain/parachain/DEPLOYMENT_CONTROL_IMPLEMENTATION.md`

**AI Agents**:
`/home/liminal/code/qnch-chain/.claude/agents/`

---

## Commands to Remember

**From monorepo root** (`/home/liminal/code/qnch-chain/`):
```bash
# Build parachain (release)
yarn build:parachain
yarn pop:build

# Start local network
yarn start:dev
yarn pop:up

# Run tests
yarn test:parachain
yarn pop:test

# Check, format, lint
yarn check:parachain
yarn format:parachain
yarn clippy:parachain
```

**From parachain directory**:
```bash
# Build with Pop CLI
pop build --release

# Start network
pop up parachain -f network.toml

# Call chain (authorize deployer)
pop call chain \
  --pallet EvmDeploymentControl \
  --function authorize_deployer \
  --args "0xYourEVMAddress" \
  --url ws://localhost:9944 \
  --suri //Alice \
  --sudo
```

**From contracts directory**:
```bash
# Fund accounts
npx hardhat run scripts/fund-accounts.ts --network qnch

# Test deployment control
npx hardhat run scripts/test-deployment-control.ts --network qnch

# Deploy contracts
npx hardhat run scripts/deploy.ts --network qnch
```

---

## Technical Details

- **Rust toolchain**: 1.77.2
- **Polkadot SDK**: stable2407
- **Frontier**: stable2407
- **Parachain ID**: 2000
- **Block time**: 6 seconds
- **EVM RPC**: http://localhost:8545
- **Substrate WebSocket**: ws://localhost:9944

---

## Success Criteria

**Minimum Viable** (Pass Stage One):
- ✅ Compiles and runs
- ✅ Uses Polkadot SDK
- ✅ Fits theme ("Building a blockchain")
- ✅ Has documentation

**Competitive** (Win Prize):
- ✅ Custom deployment control pallet (demonstrates advanced Substrate skills)
- 🚧 Deployment restriction working (needs testing)
- ✅ Professional documentation
- ⏳ Video demo (upcoming)
- ✅ Clear use case (controlled blockchain environments)

**Current Status**: ~70% complete, on track for November 16 submission
