---
name: project-decisions
description: Records all key decisions made during project planning. Use this to quickly recall what was decided and why.
tools:
  - Read
---

# Project Decisions Log

## Session Date: October 9, 2025

### Key Decisions Made

#### 1. Template Choice
**Decision**: Use OpenZeppelin EVM Runtime Template
**Rationale**:
- Audited and production-ready
- H160 (20-byte) Ethereum addresses
- Already configured for Frontier pallets
- Simpler than building from scratch

**Location**: `/home/liminal/code/polkadot-sdk/parachain-evm/` (copied from OpenZeppelin template repo)

**Why this location**: User wanted template files in the current working directory (polkadot-sdk), not a separate repository. OpenZeppelin templates are designed to be standalone - you copy just the template subdirectory you need.

---

#### 2. Deployment Control Approach
**Decision**: Custom EnsureOrigin (Approach A)
**Implementation**:
- Create `runtime/src/deployment_control.rs`
- Configure pallet-evm's `WithdrawOrigin` type
- Only sudo account can deploy contracts directly

**Why**: Clean, maintainable, follows Substrate patterns

**Rejected Alternatives**:
- Precompile-based (too complex)
- Transaction filter (less elegant)

**Implementation Guide**: `/home/liminal/code/polkadot-sdk/DEPLOYMENT_CONTROL_IMPLEMENTATION.md`

---

#### 3. Sudo Address Type
**Decision**: H160 (Ethereum address)
**Your Sudo Account**: Will be your Metamask address (20 bytes)

**Why**: OpenZeppelin template uses H160 natively, simpler workflow

**Configuration**:
```javascript
// Chain spec
"sudo": {
  "key": "0xYourMetamaskAddress"
}

// Hardhat
accounts: {
  mnemonic: "your sudo account seed phrase"
}
```

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

### Completed (Session 1 - Oct 9)
- ✅ Analyzed hackathon rules
- ✅ Reviewed FanSociety codebase
- ✅ Created deployment control implementation guide
- ✅ Cloned OpenZeppelin EVM template
- ✅ Started runtime build
- ✅ Created hackathon-coordinator agent
- ✅ Created this decisions log

### Next Session Tasks
- [ ] Verify runtime build completed
- [ ] Run parachain node locally
- [ ] Test EVM functionality (deploy simple contract)
- [ ] Begin Phase 2: Add deployment control

---

## Important Files Reference

**Complete Implementation Guide**:
`/home/liminal/code/polkadot-sdk/DEPLOYMENT_CONTROL_IMPLEMENTATION.md`

**Hackathon Strategy**:
`/home/liminal/code/polkadot-sdk/.claude/agents/hackathon-coordinator.md`

**Your Codebase**:
`/home/liminal/code/fs/` (FanSociety monorepo)

**Parachain Template**:
`/home/liminal/code/polkadot-runtime-templates/evm-template/`

---

## Questions for Next Session

### Before Phase 2:
1. Did the runtime build complete successfully?
2. Can we run the node with `--dev` flag?
3. Can we deploy a test contract via Remix?

### For Phase 2:
1. Where exactly in `lib.rs` should we add the EnsureOrigin config?
2. What sudo account (Metamask address) will you use?
3. Should we test on local node first or deploy to testnet?

---

## Risk Assessment (Current)

**Low Risk**:
- Template setup ✅
- Factory contract ✅
- Frontend integration ✅

**Medium Risk**:
- Deployment control implementation (new territory)
- Build time (25 minutes remaining)

**High Risk** (if pursuing):
- Full DOT-native token (complex XCM)
- Timeline slippage if over-engineering

**Mitigation**: Stick to phased plan, submit early (Nov 16)

---

## Commands to Remember

**Build runtime**:
```bash
cd /home/liminal/code/polkadot-runtime-templates/evm-template
cargo build --release
```

**Run node**:
```bash
./target/release/node-template --dev --rpc-cors all --rpc-methods=unsafe --rpc-external
```

**Deploy factory** (after Phase 2):
```bash
cd /home/liminal/code/fs/packages/hardhat
npx hardhat run scripts/deploy-factory.js --network parachain_local
```

---

## Success Criteria Reminder

**Minimum Viable** (Pass Stage One):
- Compiles and runs
- Uses Polkadot SDK
- Fits theme

**Competitive** (Win Prize):
- Deployment restriction working
- Factory deploys contracts
- Professional documentation
- Video demo
- Clear use case

**Your Advantages**:
- Production-ready frontend ✅
- Working factory contract ✅
- Real-world use case ✅
- 85-90% complete already ✅

---

## Notes

- Background build ID: `208a3e` (check with terminal)
- Rust toolchain: nightly-2025-02-20
- Polkadot SDK: polkadot-stable2503
- Estimated build time: 15-25 minutes total
