# XCM Local Testing Plan - Evaluation & Knowledge Gaps

## Executive Summary

This document evaluates the 6-step plan for testing XCM flow locally, identifies what we have, what's missing, and what we need to research before writing code.

**Overall Assessment**: Plan is solid with some knowledge gaps that need to be filled. Most infrastructure is already in place.

---

## Current State Analysis

### ✅ What We Already Have

1. **qnch Parachain with XCM Support**
   - Location: `/home/liminal/code/qnch-chain/parachain/`
   - XCM already configured in `runtime/src/configs/xcm.rs`
   - Pallets already included:
     - `pallet-xcm` ✅
     - `cumulus-pallet-xcm` ✅
     - `cumulus-pallet-xcmp-queue` ✅
   - XCM configuration includes:
     - XcmExecutor configured
     - Barrier configured (allows paid execution)
     - LocalAssetTransactor for handling assets
     - XcmOriginToTransactDispatchOrigin for origin conversion
     - XcmRouter for routing messages

2. **Counter Contract**
   - Location: `/home/liminal/code/qnch-chain/contracts/contracts/Counter.sol`
   - Has `inc()` function ✅
   - Has `incBy(uint)` function ✅
   - Emits events ✅

3. **Zombienet Configuration**
   - Location: `/home/liminal/code/qnch-chain/parachain/network.toml`
   - Configured for:
     - Relay chain: paseo-local
     - 2 validators (alice, bob)
     - 1 parachain (qnch, para ID 2000)

4. **Frontier EVM Setup**
   - Full Ethereum compatibility via Frontier
   - Can deploy and call Solidity contracts
   - RPC endpoints configured

### ⚠️ What Needs to be Added/Modified

1. **AssetHub Parachain**
   - Not in current Zombienet config
   - Need binary for local AssetHub
   - Need to configure as second parachain

2. **XCM Channels**
   - Need HRMP channel setup between AssetHub ↔ qnch
   - Need channel acceptance configuration

3. **XCM Precompile on AssetHub**
   - Need to verify AssetHub has XCM precompile enabled
   - Need precompile address confirmation

4. **Hardhat Configuration**
   - Need network config for local AssetHub
   - Need deployment scripts

---

## Step-by-Step Evaluation

### Step 1: Local AssetHub Setup ⚠️ NEEDS RESEARCH

**Goal**: Run AssetHub locally alongside qnch parachain in Zombienet

**Current State**:
- Zombienet config has 1 parachain (qnch)
- No AssetHub configured

**What We Need**:

1. **AssetHub Binary** 🔴 CRITICAL GAP
   - **Option A**: Build from polkadot-fellows/runtimes
     - Repository: https://github.com/polkadot-fellows/runtimes
     - Contains AssetHub runtime for Polkadot/Kusama
     - **Question**: How to build locally? What's the binary name?

   - **Option B**: Use polkadot-parachain binary with AssetHub chain spec
     - From polkadot-sdk cumulus
     - **Question**: Where to get this? How to build?

   - **Option C**: Use pre-built binary
     - **Question**: Where to download? What version matches our SDK?

2. **AssetHub Configuration** 🟡 NEEDS DEFINITION
   - Para ID for AssetHub (typically 1000 for system chains)
   - Chain spec location
   - Genesis configuration
   - **Question**: Does local AssetHub need pallet-revive? Or just standard AssetHub?

3. **Updated Zombienet Config** 🟡 NEEDS DEFINITION
   ```toml
   [relaychain]
   chain = "paseo-local"

   [[relaychain.nodes]]
   name = "alice"

   [[relaychain.nodes]]
   name = "bob"

   [[parachains]]
   id = 1000  # AssetHub
   # What command?
   # What chain spec?

   [[parachains]]
   id = 2000  # qnch
   default_command = "./target/release/parachain-template-node"
   ```

4. **HRMP Channel Setup** 🔴 CRITICAL GAP
   - Need to open HRMP channels between AssetHub (1000) and qnch (2000)
   - **Question**: How to open channels in Zombienet?
   - **Question**: Are channels auto-opened in Zombienet or manual?
   - **Question**: What's the process for accepting channels?

**Research Needed**:
- [ ] Find/build AssetHub binary for local testing
- [ ] Determine AssetHub para ID for local testing (1000?)
- [ ] Understand HRMP channel setup in Zombienet
- [ ] Find example multi-parachain Zombienet configs

**Estimated Time**: 1-2 days to research and configure

---

### Step 2: Include pallet-xcm in qnch Chain ✅ ALREADY DONE

**Goal**: Ensure qnch can receive and process XCM messages

**Current State**:
- `pallet-xcm` already included ✅
- `cumulus-pallet-xcm` already included ✅
- `cumulus-pallet-xcmp-queue` already included ✅
- Full XCM configuration in `runtime/src/configs/xcm.rs` ✅

**XCM Configuration Review**:

```rust
// From runtime/src/configs/xcm.rs

✅ XcmExecutor configured
✅ Barrier allows paid execution from everything
✅ LocalAssetTransactor handles native token
✅ XcmOriginToTransactDispatchOrigin converts origins
✅ XcmRouter routes via UMP and XCMP
✅ Weigher configured (1B weight per instruction)
```

**Potential Issue Identified** 🟡:
- Line 204: `type XcmExecuteFilter = Nothing;`
  - Comment says "Disable dispatchable execute on the XCM pallet"
  - Then says "Needs to be `Everything` for local testing"
  - **Question**: Do we need to change this to `Everything` for our XCM testing?

**Verification Needed**:
- [ ] Confirm XcmExecuteFilter setting for receiving Transact instructions
- [ ] Test that Transact instruction can call EVM contracts
- [ ] Verify weight limits are sufficient for contract calls

**Estimated Time**: 2-3 hours to verify and test

---

### Step 3: Solidity Contract with XCM Precompile ✅ MOSTLY CLEAR

**Goal**: Create Solidity contract on AssetHub that calls XCM precompile

**Current State**:
- Researcher provided two implementation examples
- Clear understanding of precompile interface

**What We Have**:
- XCM precompile address: `0x0000000000000000000000000000000000000816`
- Interface definition from researcher
- Two contract implementations (SimpleXCMCaller and Full XCMCaller)

**Knowledge Gaps** 🟡:

1. **Precompile Verification**
   - **Question**: Is XCM precompile address same in local AssetHub vs Paseo?
   - **Question**: Does local AssetHub have this precompile enabled by default?
   - **Question**: If using polkadot-fellows AssetHub, does it include precompiles?

2. **Function Selection**
   - SimpleXCMCaller uses `remote_transact()`
   - Full XCMCaller uses `send()` with manual XCM construction
   - **Question**: Which function is available in local AssetHub?
   - **Question**: Do we need to check AssetHub runtime code to confirm?

3. **EVM Call Encoding** 🔴 CRITICAL GAP
   ```solidity
   // From researcher's example:
   bytes memory call = abi.encodePacked(
       uint8(0x02), // Call type - where does this come from?
       counterAddress,
       uint256(0),  // value
       callData
   );
   ```
   - **Question**: What's the correct encoding for calling EVM contract via XCM Transact?
   - **Question**: Does the Transact instruction need to specify pallet_ethereum or pallet_evm?
   - **Question**: How does AssetHub's Transact know to route to EVM on qnch?

**Research Needed**:
- [ ] Verify XCM precompile availability in local AssetHub
- [ ] Confirm correct encoding for EVM calls in Transact
- [ ] Understand how Transact routes to EVM on destination

**Estimated Time**: 3-4 hours research + contract writing

---

### Step 4: Deployment Script for AssetHub 🟡 NEEDS DEFINITION

**Goal**: Deploy XCM contract to local AssetHub using Hardhat

**Current State**:
- Hardhat is set up in `/home/liminal/code/qnch-chain/contracts/`
- Has deployment scripts for qnch

**What We Need**:

1. **Hardhat Network Configuration** 🔴 CRITICAL GAP
   ```typescript
   // hardhat.config.ts
   networks: {
     'qnch': {
       url: 'http://127.0.0.1:9944',
       chainId: 2000,
       accounts: [PRIVATE_KEY]
     },
     'assethub-local': {
       url: '???',  // What's the RPC endpoint?
       chainId: ???,  // What's the chain ID for local AssetHub?
       accounts: [PRIVATE_KEY]
     }
   }
   ```

   **Questions**:
   - What port does AssetHub EVM RPC run on in Zombienet?
   - What's the chain ID for local AssetHub?
   - Does AssetHub use standard 8545 for EVM RPC?

2. **Account/Balance Setup** 🟡 NEEDS PLAN
   - Deployer account needs native token on AssetHub
   - **Question**: How to fund account on local AssetHub?
   - **Question**: Use //Alice, //Bob dev accounts?
   - **Question**: Does AssetHub have existential deposit?

3. **Deployment Script Structure** 🟢 CLEAR
   ```typescript
   // scripts/deploy-xcm-caller.ts
   import { ethers } from "hardhat";

   async function main() {
     // Get Counter address from qnch deployment
     const counterAddress = process.env.COUNTER_ADDRESS;

     // Deploy XCMCaller
     const XCMCaller = await ethers.getContractFactory("SimpleXCMCaller");
     const caller = await XCMCaller.deploy(counterAddress);

     await caller.waitForDeployment();
     console.log("XCMCaller deployed to:", await caller.getAddress());
   }
   ```

**Research Needed**:
- [ ] Determine AssetHub local RPC endpoints
- [ ] Confirm chain ID for local AssetHub EVM
- [ ] Setup account funding on local AssetHub

**Estimated Time**: 2-3 hours

---

### Step 5: IXcm Interface 🟢 MOSTLY CLEAR

**Goal**: Include XCM precompile interface in contracts directory

**Current State**:
- Researcher provided interface examples
- Need to create actual `.sol` file

**What We Need to Create**:

```solidity
// contracts/interfaces/IXcm.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IXcm {
    function remote_transact(
        bytes memory dest,
        bytes memory call,
        uint64 transact_weight,
        uint64 overall_weight
    ) external payable;

    function send(
        bytes memory dest,
        bytes memory message
    ) external;

    // Other functions if needed
}
```

**Knowledge Gap** 🟡:
- **Question**: What's the exact interface from AssetHub's XCM precompile?
- **Question**: Do we need all functions or just `remote_transact`?
- **Question**: Are there events we should listen for?

**Verification Needed**:
- [ ] Find actual IXcm interface from AssetHub runtime
- [ ] Confirm function signatures match
- [ ] Check if there are additional helper functions

**Estimated Time**: 1 hour to create and verify

---

### Step 6: XCM Message Scripts & Weight Checking 🔴 NEEDS SIGNIFICANT RESEARCH

**Goal**: Scripts to construct XCM messages and verify weight/format

**Current State**:
- No scripts exist
- No tooling set up for XCM testing

**What We Need to Build**:

1. **XCM Message Construction Script** 🔴 CRITICAL GAP

   Purpose: Construct proper XCM message outside of Solidity for testing

   ```javascript
   // scripts/construct-xcm-message.js
   // Using polkadot.js to construct XCM message

   const { ApiPromise, WsProvider } = require('@polkadot/api');
   const { u8aToHex } = require('@polkadot/util');

   async function constructXcmMessage() {
       // Connect to AssetHub
       const provider = new WsProvider('ws://127.0.0.1:????');
       const api = await ApiPromise.create({ provider });

       // Define destination (qnch parachain 2000)
       const dest = {
           parents: 1,
           interior: { X1: { Parachain: 2000 } }
       };

       // Define call (inc() on Counter contract)
       const call = {
           // How to encode EVM call?
           // What pallet?
           // What function?
       };

       // Construct XCM message
       const message = [
           {
               WithdrawAsset: [/* asset */]
           },
           {
               BuyExecution: {/* fees and weight */}
           },
           {
               Transact: {
                   originKind: 'Native',
                   requireWeightAtMost: 1000000000,
                   call: { encoded: /* ??? */ }
               }
           }
       ];

       // Encode and return
       const encoded = api.createType('XcmVersionedXcm', message).toU8a();
       console.log('Encoded XCM:', u8aToHex(encoded));
   }
   ```

   **Major Questions**:
   - How to encode the call to pallet_ethereum or pallet_evm?
   - What's the proper call encoding format?
   - How does this differ from the Solidity-side encoding?

2. **Weight Calculation Script** 🔴 CRITICAL GAP

   Purpose: Calculate required weight for XCM execution

   ```javascript
   // scripts/calculate-xcm-weight.js

   async function calculateWeight() {
       // Connect to qnch
       const api = await ApiPromise.create({
           provider: new WsProvider('ws://127.0.0.1:9944')
       });

       // Weight for inc() call
       const callWeight = /* How to calculate? */;

       // XCM instruction overhead
       const xcmOverhead = /* How much? */;

       // Total required weight
       const totalWeight = callWeight + xcmOverhead;

       console.log('Required transact weight:', callWeight);
       console.log('Total XCM weight:', totalWeight);
   }
   ```

   **Questions**:
   - How to calculate EVM call weight?
   - What's the XCM instruction overhead?
   - How to benchmark without executing?

3. **XCM Message Verification Script** 🟡 NEEDS DEFINITION

   Purpose: Verify XCM message format before sending

   ```javascript
   // scripts/verify-xcm-message.js

   function verifyMessage(message) {
       // Check destination encoding
       // Verify instruction sequence
       // Validate weight limits
       // Confirm call encoding
   }
   ```

4. **Testing/Monitoring Script** 🟡 NEEDS DEFINITION

   Purpose: Monitor XCM message flow

   ```javascript
   // scripts/monitor-xcm.js

   // Watch for:
   // - XcmpQueue.XcmpMessageSent on AssetHub
   // - XcmpQueue.Success on qnch
   // - Counter.Increment event on qnch
   // - Any XCM errors
   ```

**Major Knowledge Gaps**:

1. **EVM Call Encoding for XCM** 🔴
   - How to encode a call to an EVM contract in XCM Transact?
   - Is it via pallet_ethereum::Call::transact?
   - Or pallet_evm::Call::call?
   - What's the exact SCALE encoding?

2. **Weight Calculation** 🔴
   - How to calculate EVM execution weight?
   - How to estimate beforehand?
   - What happens if weight is too low?

3. **XCM Fee Payment** 🟡
   - How much native token needed for XCM execution?
   - How to estimate XCM fees?
   - Where do fees come from (sender on AssetHub? destination sovereign account?)

**Research Needed**:
- [ ] Study XCM Transact encoding for EVM calls
- [ ] Learn weight benchmarking for EVM
- [ ] Understand XCM fee structure
- [ ] Find tools for XCM message debugging

**Estimated Time**: 2-3 days

---

## Summary of Knowledge Gaps

### 🔴 Critical Gaps (Must Research Before Coding)

1. **AssetHub Binary/Setup**
   - Where to get AssetHub binary for local testing
   - How to configure in Zombienet
   - Does it need special configuration for XCM precompiles?

2. **HRMP Channel Setup**
   - How to open channels in Zombienet between AssetHub and qnch
   - Is it automatic or manual?
   - How to verify channels are open?

3. **EVM Call Encoding in XCM**
   - Exact format for encoding EVM contract call in Transact instruction
   - Which pallet to target (pallet_ethereum vs pallet_evm)
   - SCALE encoding details

4. **Weight Calculation**
   - How to calculate weight for EVM calls
   - How to estimate XCM execution weight
   - Safety margins needed

### 🟡 Important Gaps (Can Work Around Initially)

1. **XCM Precompile Verification**
   - Confirm availability on local AssetHub
   - Verify function signatures
   - Test basic functionality

2. **AssetHub RPC Configuration**
   - Determine ports and endpoints
   - Confirm chain ID
   - Setup Hardhat networks

3. **XcmExecuteFilter Setting**
   - Whether to change from `Nothing` to `Everything`
   - Impact on security vs functionality

### 🟢 Minor Gaps (Well Documented or Easy to Figure Out)

1. **Interface Creation**
   - Creating IXcm.sol interface
   - Importing into contracts

2. **Deployment Scripts**
   - Standard Hardhat deployment patterns
   - Similar to existing scripts

---

## Recommended Research Sequence

### Phase 1: Infrastructure (Days 1-2)
1. ✅ Research AssetHub local deployment
2. ✅ Learn HRMP channel setup in Zombienet
3. ✅ Create updated Zombienet config
4. ✅ Test basic AssetHub + qnch network

### Phase 2: XCM Understanding (Days 2-3)
1. ✅ Study EVM call encoding for Transact
2. ✅ Understand weight calculation
3. ✅ Learn XCM fee payment mechanics
4. ✅ Test basic XCM messages between chains

### Phase 3: Contract Development (Days 3-4)
1. ✅ Create IXcm interface
2. ✅ Develop XCM caller contract
3. ✅ Write deployment scripts
4. ✅ Create testing utilities

### Phase 4: Integration Testing (Days 4-5)
1. ✅ Deploy Counter to qnch
2. ✅ Deploy XCMCaller to AssetHub
3. ✅ Test end-to-end XCM flow
4. ✅ Debug and refine

---

## Questions for User

Before proceeding with research and implementation, please confirm:

1. **AssetHub Requirements**:
   - Do we need pallet-revive on local AssetHub, or standard AssetHub is fine?
   - Are we okay with building AssetHub from source, or prefer pre-built binary?

2. **Scope Confirmation**:
   - Is calling just `inc()` sufficient, or do we want more complex interactions?
   - Do we need bi-directional XCM (qnch → AssetHub), or just AssetHub → qnch?

3. **Timeline**:
   - How much time do we have for this? (5 days seems reasonable based on complexity)
   - Is this for a specific hackathon with deadline?

4. **Success Criteria**:
   - What constitutes "working" for the demo?
   - User pays DOT on AssetHub → Counter increments on qnch?
   - Do we need monitoring/visualization tools?

---

## Action Items Before Coding

- [ ] Research AssetHub local deployment options
- [ ] Find/create multi-parachain Zombienet example
- [ ] Study XCM Transact encoding for EVM calls
- [ ] Learn weight calculation for EVM transactions
- [ ] Understand HRMP channel setup in Zombienet
- [ ] Verify XCM precompile interface on AssetHub
- [ ] Create XCM message construction utilities
- [ ] Set up polkadot.js scripts for testing

---

## Estimated Timeline

**Total: 5-7 days**

- **Research & Setup** (2-3 days):
  - AssetHub configuration
  - HRMP channels
  - XCM encoding understanding

- **Development** (2-3 days):
  - Contracts
  - Scripts
  - Deployment tooling

- **Testing & Debugging** (1-2 days):
  - Integration testing
  - Bug fixes
  - Documentation

---

## Conclusion

**Plan Assessment**: ✅ Solid plan with identified gaps

**Readiness**: ⚠️ Not ready to code yet - need 2-3 days of research first

**Critical Blockers**:
1. AssetHub local setup
2. EVM call encoding in XCM
3. Weight calculation methodology

**Recommendation**: Focus first on getting AssetHub running locally with qnch in Zombienet, then tackle the XCM message construction once we can see actual XCM traffic between chains.

**Next Immediate Step**: Research and create multi-parachain Zombienet configuration with AssetHub + qnch.

---

*Document Created: 2025-01-28*
*Status: Evaluation Complete - Ready for Research Phase*
