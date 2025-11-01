# DOT Fee Payment Integration Challenges

This document identifies technical challenges, risks, and considerations when integrating DOT as a fee payment option (Method 1) for our EVM parachain.

## Executive Summary

While Method 1 (Native DOT Integration) is the recommended approach, several integration challenges exist, particularly around:
- **EVM transaction self-contained nature**
- **Wallet compatibility and UX**
- **Price oracle dependency**
- **XCM edge cases**
- **Testing complexity**

---

## 1. EVM Transaction Handling Challenges

### 1.1 Self-Contained Ethereum Transactions

**Challenge:**
Ethereum transactions processed via `pallet_ethereum` are "self-contained" - they don't go through normal Substrate signed extension validation the same way.

**Current Implementation** (runtime/src/lib.rs:349-353):
```rust
impl fp_rpc::ConvertTransaction<UncheckedExtrinsic> for TransactionConverter {
    fn convert_transaction(&self, transaction: pallet_ethereum::Transaction) -> UncheckedExtrinsic {
        UncheckedExtrinsic::new_unsigned(
            pallet_ethereum::Call::<Runtime>::transact { transaction }.into(),
        )
    }
}
```

**Impact:**
- EVM transactions use `new_unsigned()` - bypassing normal signed extension flow
- Fee payment logic in `ChargeAssetTxPayment` may not be invoked for EVM transactions
- EVM transactions deduct fees internally via `pallet_evm::OnChargeEVMTransaction`

**Risk Level:** 🔴 **HIGH** - Core functionality may not work as expected

**Mitigation Strategy:**

1. **Verify EVM Fee Path:**
   ```rust
   // Check: Does pallet_ethereum::transact actually go through SignedExtra?
   // Location: runtime/src/lib.rs:418-428

   impl fp_self_contained::SelfContainedCall for RuntimeCall {
       fn pre_dispatch_self_contained(
           &self,
           info: &DispatchInfoOf<Self>,
           len: usize,
       ) -> Option<Result<(), TransactionValidityError>> {
           match self {
               call @ RuntimeCall::Ethereum(pallet_ethereum::Call::transact { .. }) => {
                   // THIS is where EVM fee payment happens
                   // Need to integrate ChargeAssetTxPayment here
               }
           }
       }
   }
   ```

2. **Possible Solutions:**
   - **Option A:** Modify `SelfContainedCall` implementation to check DOT balance first
   - **Option B:** Keep EVM transactions using native token only (DOT only for Substrate txs)
   - **Option C:** Create custom `OnChargeEVMTransaction` that supports multi-asset

**Recommended Approach:**
Start with **Option B** for hackathon - EVM uses native token, Substrate transactions support DOT. Cleaner separation, easier to test.

**Research Needed:**
- Study Asset Hub's EVM implementation (if they have one)
- Check if any parachains have solved multi-asset EVM fees
- Review Frontier documentation on fee customization

---

### 1.2 Gas Price to DOT Conversion

**Challenge:**
EVM clients (MetaMask, Hardhat) send `gasPrice` in Wei units, expecting ETH-denominated fees. Our runtime needs to:
1. Accept EVM transaction with gasPrice
2. Convert gasPrice to DOT amount
3. Deduct DOT from user's foreign asset balance

**Technical Details:**

Current EVM gas calculation (pallet_evm):
```rust
// Gas price (in Wei) × Gas used = Fee in native token
// Example: 1000 Gwei × 21000 gas = 0.000021 ETH (in our case, native token)
```

With DOT fees:
```rust
// Gas price (in Wei) × Gas used = Fee in native token
// Convert native fee to DOT using oracle
// Deduct from DOT balance in ForeignAssets
```

**Risk Level:** 🟡 **MEDIUM** - Complex but solvable

**Implementation Considerations:**

1. **Gas Price Discovery:**
   - MetaMask queries `eth_gasPrice` RPC
   - Returns suggested gas price in Wei
   - Must convert to DOT-equivalent

2. **Fee Calculation Flow:**
   ```
   EVM Transaction
   ↓
   Calculate: gas_used × gas_price = native_fee
   ↓
   Query Oracle: native_fee → dot_fee
   ↓
   Check: User has dot_fee in ForeignAssets?
   ↓
   Deduct DOT or revert
   ```

3. **RPC Response Handling:**
   ```javascript
   // eth_gasPrice should return:
   // - Native token price if user has no DOT
   // - DOT-equivalent price if user prefers DOT
   // - Wallet needs to specify preference somehow
   ```

**Mitigation:**
- **Phase 1 (Hackathon):** Keep EVM transactions native-only
- **Phase 2 (Post-hackathon):** Implement custom `OnChargeEVMTransaction`
- Document limitation clearly for hackathon demo

---

### 1.3 EVM Account Model vs Substrate Accounts

**Challenge:**
Ethereum uses 20-byte addresses (0x...), Substrate uses 32-byte AccountId32. Our parachain maps between them, but asset balances are stored under AccountId32.

**Current Mapping** (runtime/src/configs/mod.rs:192-193):
```rust
type AddressMapping = pallet_evm::IdentityAddressMapping;
type BlockHashMapping = pallet_ethereum::EthereumBlockHashMapping<Self>;
```

**Scenario:**
1. User has Ethereum address: `0x1234...`
2. Maps to Substrate AccountId: `0x1234...0000` (padded)
3. DOT stored in ForeignAssets under AccountId
4. EVM transaction tries to deduct DOT - needs to look up via mapped AccountId

**Risk Level:** 🟢 **LOW** - Already handled by AddressMapping

**Verification Needed:**
- Test that ForeignAssets::balance works with EVM-mapped accounts
- Confirm IdentityAddressMapping is consistent across pallets

---

## 2. Wallet Integration Challenges

### 2.1 Multi-Asset Fee Selection UI

**Challenge:**
Standard EVM wallets (MetaMask, Rabby) don't have UI for selecting fee payment token. They assume fees are paid in native token.

**User Experience Issues:**

1. **No Asset Selection:**
   ```
   User opens MetaMask
   ↓
   Sees: "Gas fee: 0.001 ETH"
   ↓
   Expects: Native token deduction
   ↓
   Reality: Could be DOT or native, user has no control
   ```

2. **Balance Display:**
   - MetaMask shows one balance (native token)
   - Doesn't show DOT balance
   - User confused about which balance is used for fees

3. **Transaction Simulation:**
   - Wallets simulate transactions to estimate fees
   - Simulation assumes native token
   - Fails if user only has DOT

**Risk Level:** 🔴 **HIGH** - Poor UX, user confusion

**Mitigation Strategies:**

**Short-term (Hackathon):**
1. **Build Custom UI:**
   - Create Next.js dApp that wraps MetaMask
   - Shows both balances (native + DOT)
   - Let user pre-select fee token via our UI
   - Our UI constructs transaction with asset hint

2. **Documentation:**
   - Clear docs: "Keep small native balance for EVM fees"
   - Or: "Use our dApp UI for DOT fee payment"

**Long-term (Post-hackathon):**
1. **Custom RPC Method:**
   ```javascript
   // Add custom RPC: eth_setFeeAsset
   await ethereum.request({
     method: 'eth_setFeeAsset',
     params: [{ assetId: 1 }] // 1 = DOT
   });
   ```

2. **WalletConnect Integration:**
   - Use WalletConnect v2 custom methods
   - Pass fee asset preference in session

3. **Polkadot.js Integration:**
   - For Substrate users, Polkadot.js Apps supports asset selection
   - EVM users still need custom solution

**UX Recommendation for Hackathon:**
Create simple toggle in demo UI:
```
[Transaction Details]
Fee Payment: [Native Token ▼]
             ├─ Native Token (0.5 UNIT available)
             └─ DOT (1.2 DOT available)

[Confirm Transaction]
```

---

### 2.2 Account Initialization (Existential Deposit)

**Challenge:**
New users need both:
1. Native token existential deposit
2. DOT balance for fees

This creates a chicken-egg problem for onboarding.

**Scenarios:**

**Scenario A: User transfers DOT from relay chain**
```
1. User has DOT on relay chain
2. Transfers to parachain via XCM
3. DOT arrives in ForeignAssets
4. User tries EVM transaction → FAILS (no native ED)
```

**Scenario B: User receives DOT from another user**
```
1. User receives DOT transfer on parachain
2. Account created with DOT balance
3. Tries EVM transaction → FAILS (no native ED)
```

**Risk Level:** 🟡 **MEDIUM** - UX friction

**Mitigation:**

1. **Faucet Strategy:**
   - Provide testnet faucet that sends both:
     - Minimum native token (1 MILLIUNIT ED)
     - Some DOT for fees (0.1 DOT)

2. **Smart Defaults:**
   - When receiving first DOT transfer, auto-transfer tiny native amount
   - Requires XCM coordination or relay chain integration

3. **Documentation:**
   - Clear onboarding guide
   - "You need small native balance even with DOT fees"

---

### 2.3 Transaction Nonce Management

**Challenge:**
Ethereum nonces are sequential per address. With multi-asset fees, failed transactions due to insufficient DOT could cause nonce gaps.

**Scenario:**
```
User sends transactions:
Nonce 0: Success (native fee)
Nonce 1: FAIL (tried DOT, insufficient balance)
Nonce 2: Queued (can't process until nonce 1)
```

**Risk Level:** 🟢 **LOW** - Standard Ethereum behavior

**Mitigation:**
- Transaction fails at validation stage before nonce increment
- Standard retry logic applies
- Document for users

---

## 3. Price Oracle Challenges

### 3.1 Fixed Rate Limitations (Hackathon)

**Challenge:**
Using `SimplePriceOracle` with fixed 1:1000 rate is not production-ready.

**Issues:**

1. **Arbitrage Risk:**
   - If DOT real price: 1 DOT = 10 USD
   - Native token price: 1 UNIT = 0.001 USD
   - Fixed rate says: 1 DOT = 1000 UNIT (correct)
   - But if prices change and rate doesn't update:
     - Real: 1 DOT = 12 USD, 1 UNIT = 0.001 USD
     - Fixed: 1 DOT still = 1000 UNIT
     - Users exploited!

2. **Fee Over/Underpayment:**
   - Fixed rate stale → users pay wrong amount
   - Parachain loses revenue or users overpay

**Risk Level:** 🔴 **HIGH** for production, 🟢 **LOW** for hackathon demo

**Mitigation:**

**Hackathon:**
- Use fixed rate, document limitation
- Choose reasonable rate based on current prices
- Demo works, just not production-ready

**Post-Hackathon:**
Implement proper oracle:

**Option 1: ORML Oracle Pallet**
```rust
impl pallet_oracle::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type OnNewData = ();
    type CombineData = pallet_oracle::DefaultCombineData<Runtime, MinimumCount, MaximumProviders>;
    type Time = Timestamp;
    type OracleKey = CurrencyId;
    type OracleValue = Price;
}
```

**Option 2: Acurast Oracle** (Recommended by guide)
- Decentralized oracle network
- Multiple data sources
- Built for Polkadot ecosystem

**Option 3: DIA Oracle**
- Price feeds for DOT and many tokens
- Proven in production

**Implementation Timeline:**
- Week 1 post-hackathon: Research oracle options
- Week 2-3: Integrate oracle pallet
- Week 4: Test with live price feeds
- Week 5: Audit and deploy

---

### 3.2 Oracle Failure Scenarios

**Challenge:**
What happens if oracle feed stops updating?

**Scenarios:**

1. **Stale Price:**
   - Last update: 1 hour ago
   - DOT price moved 10%
   - Fees miscalculated

2. **No Price Data:**
   - Oracle offline
   - Cannot calculate DOT fees
   - Transactions fail?

3. **Malicious Price:**
   - Oracle compromised
   - Reports fake price
   - Economic attack

**Risk Level:** 🔴 **HIGH** - System-wide impact

**Mitigation:**

1. **Fallback Logic:**
   ```rust
   fn get_dot_price() -> Option<Balance> {
       // Try oracle
       if let Some(price) = Oracle::get_price(DOT) {
           // Check freshness (< 10 minutes old)
           if price.is_fresh() {
               return Some(price.value);
           }
       }

       // Fallback: Use last known good price
       // Or fallback: Disable DOT fees temporarily
       // Or fallback: Use DEX pool ratio

       None // Force native token fees
   }
   ```

2. **Price Bounds:**
   ```rust
   const MIN_DOT_PRICE: Balance = 5_000; // 5 USD in native
   const MAX_DOT_PRICE: Balance = 20_000; // 20 USD in native

   fn validate_price(price: Balance) -> bool {
       price >= MIN_DOT_PRICE && price <= MAX_DOT_PRICE
   }
   ```

3. **Monitoring:**
   - Off-chain monitoring of price feed
   - Alerts if price stale > 15 minutes
   - Emergency governance to disable DOT fees

---

## 4. XCM Integration Challenges

### 4.1 DOT Reserve Transfers

**Challenge:**
Users need to transfer DOT from relay chain to parachain. This requires XCM `ReserveAssetDeposited` handling.

**Current XCM Config** (runtime/src/configs/xcm.rs):
- Has basic XCM setup
- Needs multi-asset transactor (from plan Phase 2)

**Potential Issues:**

1. **Incorrect Asset Recognition:**
   ```
   User sends: Location::parent() (DOT)
   Parachain receives: Unknown asset
   Funds stuck!
   ```

2. **Minimum Transfer Amount:**
   - Relay chain ED: 1 DOT (10^10 plancks)
   - Parachain ED for foreign asset: ?
   - If mismatch, transfers fail

3. **XCM Fees:**
   - Sending DOT via XCM costs DOT
   - User needs DOT on relay to pay XCM fee
   - Then DOT arrives on parachain
   - Net: User loses some DOT to XCM fees

**Risk Level:** 🟡 **MEDIUM** - Can be tested thoroughly

**Testing Required:**

1. **Happy Path:**
   - Transfer 2 DOT from relay to parachain
   - Verify appears in ForeignAssets
   - Check asset ID = 1, balance correct

2. **Edge Cases:**
   - Transfer below ED
   - Transfer to non-existent account
   - Multiple transfers (test accumulation)

3. **Failure Cases:**
   - Invalid beneficiary
   - Insufficient XCM fee
   - Asset not registered

**Mitigation:**
- Comprehensive XCM testing in Phase 4
- Document minimum transfer amounts
- Provide test scripts for common scenarios

---

### 4.2 Asset Registration Timing

**Challenge:**
DOT must be registered as asset ID 1 before users can receive it via XCM.

**Registration Steps:**
1. Runtime deployed with ForeignAssets pallet
2. Sudo calls `force_create(1, admin, min_balance)`
3. Sudo calls `force_set_metadata(1, "Polkadot", "DOT", 10)`
4. Asset ready for use

**Timing Issues:**

**Scenario: Genesis Registration**
- Include asset creation in genesis config
- Parachain starts with DOT already registered
- ✅ Clean, no post-launch steps needed

**Scenario: Post-Launch Registration**
- Parachain launches without DOT registered
- Admin registers via extrinsic
- ⚠️ Window where DOT transfers fail

**Risk Level:** 🟢 **LOW** - Easy to handle

**Recommended Approach:**

Use genesis configuration:

```rust
// File: node/src/chain_spec.rs
// Add to testnet_genesis():

foreign_assets: ForeignAssetsConfig {
    assets: vec![
        // DOT from relay chain
        (
            1u32, // Asset ID
            get_account_id_from_seed::<sr25519::Public>("Alice"), // Admin
            true, // is_sufficient
            1_000_000_000, // min_balance (0.1 DOT)
        ),
    ],
    metadata: vec![
        (
            1u32,
            b"Polkadot".to_vec(),
            b"DOT".to_vec(),
            10, // decimals
        ),
    ],
    accounts: vec![],
},
```

**Benefit:** Asset exists from block 0, no coordination needed.

---

### 4.3 Multi-Hop XCM Scenarios

**Challenge:**
What if DOT comes not from relay chain, but from another parachain?

**Scenario:**
```
AssetHub (has DOT)
    → XCM transfer →
Our Parachain
```

**Asset Location Mismatch:**
- Direct from relay: `Location::parent()`
- Via AssetHub: `Location { parents: 1, interior: X1(Parachain(1000)) }`
  - Wait, no. DOT is still `parent()`, just sent via AssetHub

**Actually:**
- DOT location is ALWAYS `Location::parent()` (relay chain)
- Even if sent via intermediary parachain
- AssetHub doesn't change DOT's identity

**Risk Level:** 🟢 **LOW** - XCM handles this correctly

**Verification:**
- Test DOT transfer from AssetHub to parachain
- Confirm asset ID resolution works
- Should "just work" if basic XCM configured correctly

---

## 5. Testing Challenges

### 5.1 Integration Test Complexity

**Challenge:**
Testing DOT fee payment requires:
1. Running local relay chain
2. Running parachain
3. Registering parachain
4. Transferring DOT via XCM
5. Submitting transactions with DOT fees
6. Verifying fee deduction

This is a multi-chain, multi-step integration test.

**Current Testing Setup:**
- `network.toml` defines 2-validator relay + 1 parachain
- Zombienet used via `pop up network`
- ✅ Infrastructure exists, needs test scripts

**Risk Level:** 🟡 **MEDIUM** - Time-consuming but doable

**Mitigation:**

**Create Test Suite:**

```bash
# File: scripts/test_dot_fees.sh

#!/bin/bash
set -e

echo "1. Starting Zombienet..."
pop up network ./network.toml &
NETWORK_PID=$!
sleep 30 # Wait for network

echo "2. Registering DOT asset..."
pop call chain \
  --pallet ForeignAssets \
  --function force_create \
  --args "1" "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" "1000000000" \
  --url ws://localhost:9944 \
  --suri //Alice \
  --sudo

echo "3. Transferring DOT from relay to parachain..."
# Use XCM transfer script

echo "4. Submitting transaction with DOT fee..."
# Submit via custom RPC or Polkadot.js

echo "5. Verifying fee deduction..."
# Query balances before/after

echo "✅ All tests passed"
kill $NETWORK_PID
```

**Automated Testing:**
- CI/CD pipeline runs test suite
- Fail fast on integration issues
- Document all test cases

---

### 5.2 EVM Transaction Testing

**Challenge:**
Testing EVM transactions with DOT fees (if implemented) requires:
1. MetaMask or programmatic Ethereum signer
2. Contract deployment
3. Transaction submission
4. Gas estimation

**Complexity:**
- Ethereum testing tools (Hardhat, Foundry) assume native gas token
- May need custom provider to signal DOT preference
- Difficult to automate without wallet support

**Risk Level:** 🔴 **HIGH** if implementing EVM DOT fees, 🟢 **LOW** if not

**Recommendation:**
- **Hackathon:** Skip EVM DOT fees, test only Substrate transactions
- **Demo:** Show Substrate transaction with DOT fee payment
- **Future:** Tackle EVM DOT fees as Phase 2 feature

---

### 5.3 Edge Case Coverage

**Test Cases Needed:**

1. **Insufficient Balance:**
   - User has 0.01 DOT
   - Transaction needs 0.05 DOT
   - Should fail gracefully

2. **Asset Not Registered:**
   - Try to pay with asset ID 999
   - Should reject at validation

3. **Concurrent Transactions:**
   - User submits 2 txs simultaneously
   - Both try to use DOT
   - Nonce and balance handling

4. **Large Fees:**
   - Transaction with very high weight
   - DOT fee > user balance
   - Should fail before execution

5. **Zero-Fee Transactions:**
   - Sudo or special origins
   - Should not deduct DOT

**Risk Level:** 🟡 **MEDIUM** - Important for robustness

**Mitigation:**
- Write unit tests for fee calculation logic
- Integration tests for transaction flow
- Document known edge cases

---

## 6. Performance and Cost Challenges

### 6.1 Storage Overhead

**Challenge:**
Adding ForeignAssets pallet increases state size.

**Storage Items:**
- Asset metadata (per asset)
- Account balances (per account per asset)
- Approvals, freezes, etc.

**Impact:**
- Larger state = higher sync time
- More storage reads per transaction
- Increased proof sizes for parachains

**Risk Level:** 🟢 **LOW** - Acceptable trade-off

**Mitigation:**
- Limit number of foreign assets (start with just DOT)
- Monitor state growth
- Optimize storage layout if needed

---

### 6.2 Transaction Weight Increase

**Challenge:**
Multi-asset fee payment adds computational overhead.

**Additional Operations:**
1. Read DOT balance (ForeignAssets lookup)
2. Calculate conversion rate (oracle query or fixed calc)
3. Deduct from DOT balance
4. Update storage

**Weight Impact:**
- Native fee payment: ~5,000 weight
- Multi-asset payment: ~15,000 weight (estimated)
- Increase: ~3x

**Risk Level:** 🟢 **LOW** - Still very cheap

**Mitigation:**
- Benchmark actual weight usage
- Update weight annotations
- Charge appropriately

---

## 7. Economic and Game Theory Challenges

### 7.1 Fee Token Preference

**Challenge:**
If DOT and native token both accepted, which do users prefer?

**Scenarios:**

**Scenario A: DOT is cheaper**
- Users always pay in DOT
- Native token unused
- Native token price drops
- Feedback loop: Everyone prefers DOT

**Scenario B: Native token is cheaper**
- Users pay in native
- DOT option unused
- Why did we implement it?

**Scenario C: Balanced**
- Some users prefer DOT (coming from relay)
- Some prefer native (local holders)
- Healthy mix

**Risk Level:** 🟡 **MEDIUM** - Could affect tokenomics

**Mitigation:**
- Monitor which asset is used more
- Consider fee multipliers to balance usage
- Engage community for feedback

---

### 7.2 Dust Attacks

**Challenge:**
Attacker sends tiny DOT amounts to many accounts.

**Attack Vector:**
1. Register 10,000 accounts
2. Transfer 0.0001 DOT to each
3. Each account now has storage footprint
4. State bloat

**Risk Level:** 🟢 **LOW** - Standard blockchain issue

**Mitigation:**
- Existential deposit for foreign assets
- Accounts with < ED are not created
- Reap accounts that fall below ED

---

## 8. Governance and Upgradability Challenges

### 8.1 Runtime Upgrades with New Pallets

**Challenge:**
Adding ForeignAssets and AssetTxPayment requires runtime upgrade.

**Migration Needs:**
- Initialize ForeignAssets storage
- Migrate existing transactions (none yet)
- Update SignedExtra (breaking change!)

**Risk Level:** 🟡 **MEDIUM** - Breaking change

**Mitigation:**

```rust
// File: runtime/src/migrations.rs

pub mod add_foreign_assets {
    use super::*;

    pub struct Migration<T>(PhantomData<T>);

    impl<T: frame_system::Config> OnRuntimeUpgrade for Migration<T> {
        fn on_runtime_upgrade() -> Weight {
            log::info!("Migrating to add ForeignAssets support");

            // Initialize ForeignAssets storage
            // Set up DOT asset

            Weight::from_parts(10_000_000, 0)
        }
    }
}
```

**Deployment Plan:**
1. Test migration on local network
2. Deploy to testnet, verify
3. Announce breaking changes to users
4. Deploy to production with governance vote

---

### 8.2 Reverting Changes

**Challenge:**
What if DOT fee payment has critical bug? Can we roll back?

**Considerations:**
- Remove AssetTxPayment from SignedExtra
- Keep ForeignAssets (users may have DOT)
- Disable DOT fee payment without losing DOT balances

**Risk Level:** 🟢 **LOW** - Feature flags can help

**Mitigation:**

```rust
// Add feature flag
#[cfg(feature = "dot-fee-payment")]
type SignedExtra = (
    // ... other extensions
    pallet_asset_tx_payment::ChargeAssetTxPayment<Runtime>,
);

#[cfg(not(feature = "dot-fee-payment"))]
type SignedExtra = (
    // ... other extensions
    pallet_transaction_payment::ChargeTransactionPayment<Runtime>,
);
```

---

## 9. Documentation and Communication Challenges

### 9.1 User Education

**Challenge:**
Users need to understand:
- What DOT fee payment means
- How to get DOT on parachain
- When to use DOT vs native
- Troubleshooting common issues

**Risk Level:** 🟡 **MEDIUM** - UX barrier

**Mitigation:**
- Create comprehensive user docs (see plan Phase 5)
- Video tutorials
- FAQ section
- Support channels

---

### 9.2 Developer Documentation

**Challenge:**
Wallet and dApp developers need to integrate with:
- XcmPaymentApi
- Asset selection in transactions
- Balance queries for multiple assets

**Risk Level:** 🟡 **MEDIUM** - Adoption barrier

**Mitigation:**
- API documentation
- Code examples
- Reference implementation
- Developer support

---

## 10. Security Challenges

### 10.1 Fee Payment Bypass

**Challenge:**
Can attacker craft transaction that avoids paying fees?

**Attack Vectors:**
1. Claim to pay in DOT but provide invalid asset ID
2. Pay insufficient DOT amount
3. Race condition: spend DOT between validation and execution

**Risk Level:** 🟢 **LOW** - Substrate handles this

**Mitigation:**
- Validation happens before dispatch
- Insufficient balance = transaction rejected
- Substrate's signed extension framework is secure

---

### 10.2 Reentrancy Attacks

**Challenge:**
Can malicious contract exploit fee payment logic?

**Scenario:**
1. Contract call triggers fee payment
2. Fee payment calls back to contract
3. Contract state inconsistent

**Risk Level:** 🟢 **LOW** - EVM forbids reentrancy (enabled in our runtime)

**Verification:**
```rust
// runtime/src/configs/mod.rs
impl pallet_evm::Config for Runtime {
    // ...
    type ForbidReentrancy = True; // ✅ Already enabled
}
```

---

## Summary: Challenge Prioritization

### Critical (Must Solve for Hackathon)
1. ✅ Add ForeignAssets pallet (Plan Phase 1)
2. ✅ Configure XCM for DOT reception (Plan Phase 2)
3. ✅ Implement AssetTxPayment (Plan Phase 3)
4. ⚠️ **TEST that Substrate transactions work with DOT fees** (Plan Phase 4)
5. ⚠️ **Decide: Support EVM DOT fees or not?** (Recommendation: Not for hackathon)

### Important (Document/Mitigate)
1. Price oracle limitation (fixed rate) - document clearly
2. Wallet UX challenges - build custom UI for demo
3. Account initialization (ED problem) - document in setup guide
4. XCM testing - comprehensive test suite

### Nice-to-Have (Post-Hackathon)
1. EVM transaction DOT fee support
2. Production oracle integration
3. Advanced wallet integration
4. Governance controls for asset registration

---

## Recommended Hackathon Scope

**IN SCOPE:**
- ✅ DOT as foreign asset
- ✅ XCM DOT reception from relay
- ✅ Substrate transaction DOT fees
- ✅ Fixed-rate price conversion
- ✅ Basic testing
- ✅ Documentation

**OUT OF SCOPE:**
- ❌ EVM transaction DOT fees (too complex)
- ❌ Production oracle (not ready)
- ❌ MetaMask native integration (no wallet support)
- ❌ Multiple foreign assets (just DOT)
- ❌ DEX-based pricing (Method 2)

**DEMO NARRATIVE:**
1. Show DOT transfer from relay to parachain (XCM)
2. Show Substrate transaction paying fees in DOT
3. Show balance updates (DOT deducted)
4. Explain limitation: EVM still uses native token
5. Roadmap slide: Future EVM support

This scoping makes the hackathon achievable while still demonstrating core DOT fee functionality.

---

## Next Steps

After reviewing these challenges:

1. **Confirm scope** with team
2. **Decide on EVM support** (yes/no for hackathon)
3. **Begin Phase 1** implementation (dependencies)
4. **Set up test environment** early (Zombienet)
5. **Document decisions** in project notes

---

*Last Updated: 2025-10-28*
*Status: Challenge Analysis Complete*
