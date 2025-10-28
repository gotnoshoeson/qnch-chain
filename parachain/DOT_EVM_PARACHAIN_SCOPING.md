# DOT-Native EVM Parachain with Restricted Deployment - Technical Scoping Document

## Project Overview

Build a parachain with the following characteristics:
- **Native Token**: DOT (Polkadot relay chain token)
- **Smart Contracts**: EVM-compatible smart contracts
- **Deployment Model**: Permissioned deployment via factory contract pattern
  - Users CANNOT deploy contracts directly
  - Users CAN ONLY deploy contracts through a pre-deployed factory contract

---

## Architecture Summary

### Core Components

1. **Runtime**: Substrate-based parachain runtime using `pallet-revive` for EVM support
2. **Node**: Polkadot omni-node (no custom node code required)
3. **Consensus**: Aura (6-second block times with async backing)
4. **Token Economics**: DOT via XCM reserve transfers from relay chain
5. **Deployment Control**: Custom `EnsureOrigin` implementation restricting contract instantiation

---

## Component 1: EVM Integration & Deployment Restrictions

### 1.1 EVM Pallet Choice: `pallet-revive`

**Location**: `/substrate/frame/revive/`

**Why pallet-revive over traditional pallet-evm:**
- Modern architecture supporting both PolkaVM and EVM bytecode
- Better integration with Substrate patterns
- Active development in Polkadot SDK
- Supports both 32-byte (Substrate) and 20-byte (Ethereum) addresses

**Key Features**:
- EVM bytecode execution via PolkaVM backend
- Ethereum transaction compatibility
- Precompile support for custom functionality
- Gas metering aligned with EVM standards

### 1.2 Deployment Control Mechanism

**Recommended Approach**: Custom `EnsureOrigin` Implementation

**Why this approach:**
- Clean separation of concerns
- No modification to core pallet code required
- Works for both Substrate calls AND Ethereum transactions
- Follows Substrate security best practices
- Maintainable across runtime upgrades

**Implementation Pattern**:

```rust
// Define whitelist storage
#[pallet::storage]
pub type DeploymentWhitelist<T: Config> =
    StorageMap<_, Blake2_128Concat, T::AccountId, (), OptionQuery>;

// Custom EnsureOrigin for deployment permission
pub struct EnsureFactoryOnly<T>(PhantomData<T>);

impl<T: Config> EnsureOrigin<T::RuntimeOrigin> for EnsureFactoryOnly<T>
where
    T: pallet_revive::Config,
{
    type Success = T::AccountId;

    fn try_origin(o: T::RuntimeOrigin) -> Result<Self::Success, T::RuntimeOrigin> {
        let who = frame_system::ensure_signed(o.clone())?;

        // Only whitelisted accounts (e.g., factory contract) can deploy
        if !DeploymentWhitelist::<T>::contains_key(&who) {
            return Err(o);
        }

        Ok(who)
    }
}

// Runtime configuration
impl pallet_revive::Config for Runtime {
    // Anyone can upload code (or restrict this too if desired)
    type UploadOrigin = EnsureSigned<Self::AccountId>;

    // Only factory can instantiate contracts
    type InstantiateOrigin = EnsureFactoryOnly<Self>;

    type AllowEVMBytecode = ConstBool<true>;
    type ChainId = ConstU64<YOUR_CHAIN_ID>;
    // ... other config
}
```

**How It Works**:

1. **Direct Deployment Blocked**: When users try to deploy contracts directly (via Ethereum transactions or Substrate calls), the `InstantiateOrigin` check fails unless their account is whitelisted
2. **Factory Whitelisted**: The factory contract's associated account is added to whitelist at genesis or via governance
3. **Factory Deploys**: Users interact with factory contract which internally calls instantiate - this succeeds because factory is whitelisted
4. **Ethereum TX Compatibility**: Works transparently with Ethereum JSON-RPC transactions

**Alternative Approaches** (not recommended):

- **Precompile-based**: More complex, requires careful weight management
- **Transaction Extension**: Broader scope, affects all transactions
- **Pallet Fork**: Maintenance burden, upgrade difficulties

### 1.3 Key Files & Code Locations

| Component | File Path | Key Lines |
|-----------|-----------|-----------|
| CREATE/CREATE2 Opcodes | `/substrate/frame/revive/src/vm/evm/instructions/contract.rs` | 36-104 |
| Config Trait | `/substrate/frame/revive/src/lib.rs` | 141-310 |
| Upload/Instantiate Origins | `/substrate/frame/revive/src/lib.rs` | 248-261 |
| Bare Instantiate Logic | `/substrate/frame/revive/src/lib.rs` | 1329-1398 |
| Ethereum TX Validation | `/substrate/frame/revive/src/evm/call.rs` | 49-198 |
| Test Examples | `/substrate/frame/revive/src/tests.rs` | 334-393 |
| Dev Runtime Example | `/substrate/frame/revive/dev-node/runtime/src/lib.rs` | 332-344 |

### 1.4 Factory Contract Design

**Responsibilities**:
1. Accept deployment requests from users
2. Validate deployment parameters (optional: template restrictions, fee collection)
3. Deploy contracts using internal instantiate calls
4. Emit events for deployed contracts
5. Maintain registry of deployed contracts

**Solidity Example Pattern**:

```solidity
contract DeploymentFactory {
    event ContractDeployed(address indexed deployer, address indexed contractAddress);

    mapping(address => address[]) public userContracts;

    function deployContract(bytes memory bytecode, bytes memory constructorArgs)
        public
        payable
        returns (address)
    {
        // Optional: Charge deployment fee
        require(msg.value >= deploymentFee, "Insufficient fee");

        // Optional: Validate bytecode against approved templates

        // Deploy contract
        address contractAddress;
        bytes memory creationCode = abi.encodePacked(bytecode, constructorArgs);
        assembly {
            contractAddress := create(0, add(creationCode, 0x20), mload(creationCode))
        }
        require(contractAddress != address(0), "Deployment failed");

        // Track deployment
        userContracts[msg.sender].push(contractAddress);
        emit ContractDeployed(msg.sender, contractAddress);

        return contractAddress;
    }
}
```

---

## Component 2: DOT as Native Token

### 2.1 Overview

The parachain will use DOT (relay chain token) instead of a custom parachain token. All tokens must flow from the relay chain via XCM reserve transfers.

**Key Constraint**: Parachain CANNOT mint relay chain tokens - all DOT must come from Polkadot relay chain.

### 2.2 Token Constants (Polkadot Mainnet)

```rust
pub mod currency {
    use polkadot_core_primitives::Balance;

    // Polkadot uses 10 decimals (different from Kusama/Rococo which use 12!)
    pub const UNITS: Balance = 10_000_000_000; // 1 DOT = 10^10 plancks
    pub const CENTS: Balance = UNITS / 100;     // 0.01 DOT
    pub const MILLICENTS: Balance = CENTS / 1_000; // 0.00001 DOT

    // Set to 1/10 of relay chain's existential deposit
    // Polkadot relay: 1 DOT, so parachain: 0.1 DOT
    pub const EXISTENTIAL_DEPOSIT: Balance = CENTS * 10;

    pub const fn deposit(items: u32, bytes: u32) -> Balance {
        items as Balance * 100 * CENTS + (bytes as Balance) * 5 * MILLICENTS
    }
}
```

**CRITICAL**: Different networks use different decimals:
- **Polkadot**: 10 decimals
- **Kusama/Rococo/Westend**: 12 decimals

### 2.3 Runtime Configuration

#### pallet-balances

```rust
parameter_types! {
    pub const ExistentialDeposit: Balance = EXISTENTIAL_DEPOSIT;
}

impl pallet_balances::Config for Runtime {
    type MaxLocks = ConstU32<50>;
    type Balance = Balance; // u128
    type RuntimeEvent = RuntimeEvent;
    type DustRemoval = ();
    type ExistentialDeposit = ExistentialDeposit;
    type AccountStore = System;
    type WeightInfo = pallet_balances::weights::SubstrateWeight<Runtime>;
    type MaxReserves = ConstU32<50>;
    type ReserveIdentifier = [u8; 8];
    type RuntimeHoldReason = RuntimeHoldReason;
    type RuntimeFreezeReason = RuntimeFreezeReason;
    type FreezeIdentifier = RuntimeFreezeReason;
    type MaxFreezes = ConstU32<50>;
    type DoneSlashHandler = ();
}
```

#### pallet-transaction-payment

```rust
parameter_types! {
    pub const TransactionByteFee: Balance = MILLICENTS;
}

impl pallet_transaction_payment::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type OnChargeTransaction =
        pallet_transaction_payment::FungibleAdapter<Balances, Treasury>; // or DealWithFees
    type WeightToFee = WeightToFee; // Custom fee calculation
    type LengthToFee = ConstantMultiplier<Balance, TransactionByteFee>;
    type FeeMultiplierUpdate = SlowAdjustingFeeUpdate<Self>;
    type OperationalFeeMultiplier = ConstU8<5>;
    type WeightInfo = pallet_transaction_payment::weights::SubstrateWeight<Runtime>;
}
```

### 2.4 XCM Configuration

#### Asset Transactor (Handle DOT)

```rust
parameter_types! {
    pub const TokenLocation: Location = Location::parent();
    pub const RelayNetwork: NetworkId = NetworkId::Polkadot;
}

pub type LocationToAccountId = (
    ParentIsPreset<AccountId>,
    SiblingParachainConvertsVia<Sibling, AccountId>,
    AccountId32Aliases<RelayNetwork, AccountId>,
);

/// Handle relay chain DOT as fungible asset
pub type FungibleTransactor = FungibleAdapter<
    Balances,
    IsConcrete<TokenLocation>, // Match Location::parent()
    LocationToAccountId,
    AccountId,
    (), // No teleports
>;
```

#### Reserve Configuration

```rust
parameter_types! {
    /// Relay chain is reserve for its native token
    pub RelayTokenForRelay: (AssetFilter, Location) =
        (Wild(AllOf {
            id: AssetId(Parent.into()),
            fun: WildFungible
        }), Parent.into());
}

pub type IsReserve = xcm_builder::Case<RelayTokenForRelay>;
```

#### Fee Payment (Trader)

```rust
pub type Trader = UsingComponents<
    WeightToFee,
    TokenLocation,
    AccountId,
    Balances,
    Treasury, // Where fees go
>;
```

#### pallet-xcm Configuration

```rust
impl pallet_xcm::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type SendXcmOrigin = EnsureXcmOrigin<RuntimeOrigin, ()>;
    type XcmRouter = XcmRouter;
    type ExecuteXcmOrigin = EnsureXcmOrigin<RuntimeOrigin, LocalOriginToLocation>;
    type XcmExecuteFilter = Everything;
    type XcmExecutor = XcmExecutor<XcmConfig>;
    type XcmTeleportFilter = Nothing; // No teleports for relay token
    type XcmReserveTransferFilter = Everything;
    type Weigher = WeightInfoBounds<XcmWeight<RuntimeCall>, RuntimeCall, MaxInstructions>;
    type UniversalLocation = UniversalLocation;
    type RuntimeOrigin = RuntimeOrigin;
    type RuntimeCall = RuntimeCall;
    const VERSION_DISCOVERY_QUEUE_SIZE: u32 = 100;
    type AdvertisedXcmVersion = pallet_xcm::CurrentXcmVersion;

    // Use relay token for XCM fees
    type Currency = Balances;
    type CurrencyMatcher = IsConcrete<TokenLocation>;

    type TrustedLockers = ();
    type SovereignAccountOf = LocationToAccountId;
    type MaxLockers = ConstU32<8>;
    type WeightInfo = pallet_xcm::weights::SubstrateWeight<Runtime>;
    type AdminOrigin = EnsureRoot<AccountId>;
    type MaxRemoteLockConsumers = ConstU32<0>;
    type RemoteLockConsumerIdentifier = ();
}
```

### 2.5 Reference Examples

- **Asset Hub Rococo**: `/cumulus/parachains/runtimes/assets/asset-hub-rococo/`
- **XCM Cookbook Example**: `/polkadot/xcm/docs/src/cookbook/relay_token_transactor/`
- **Bridge Hub Rococo**: `/cumulus/parachains/runtimes/bridge-hubs/bridge-hub-rococo/`

---

## Component 3: Parachain Runtime & Node Setup

### 3.1 Use Omni-Node (Recommended)

**Why**: No need to maintain custom node code for standard parachain setup.

**Requirements**:
- Runtime uses Aura consensus
- Block number type is `u32`
- Implements `sp_genesis_builder::GenesisBuilder` API
- Contains `cumulus-pallet-parachain-system` and `frame-system`

**Limitations**:
- No BABE or PoW consensus support
- Only for parachains (not solo chains)
- No custom transaction pool logic

**Installation**:
```bash
cargo install polkadot-omni-node --locked
```

**Usage**:
```bash
# Generate chain spec
chain-spec-builder create \
    --relay-chain polkadot \
    --para-id 2000 \
    --runtime target/release/wbuild/runtime.wasm \
    named-preset development

# Run omni-node
polkadot-omni-node --chain chain-spec.json --dev
```

### 3.2 Runtime Template Base

**Recommended**: Start with OpenZeppelin EVM Runtime Template

**Repository**: `https://github.com/OpenZeppelin/polkadot-runtime-templates`

**Features**:
- Fully audited
- EVM compatibility out-of-box
- 20-byte Ethereum addresses
- Account abstraction support
- Secure defaults

**Alternative**: Polkadot SDK Parachain Template
- **Location**: `/templates/parachain/`
- **Repository**: `https://github.com/paritytech/polkadot-sdk-parachain-template`
- More minimal, requires adding EVM support

### 3.3 Runtime Pallet Composition

```rust
#[frame_support::runtime]
mod runtime {
    #[runtime::runtime]
    pub struct Runtime;

    // Core Infrastructure (0-9)
    #[runtime::pallet_index(0)]
    pub type System = frame_system;

    #[runtime::pallet_index(1)]
    pub type ParachainSystem = cumulus_pallet_parachain_system;

    #[runtime::pallet_index(2)]
    pub type Timestamp = pallet_timestamp;

    #[runtime::pallet_index(3)]
    pub type ParachainInfo = parachain_info;

    // Monetary (10-19)
    #[runtime::pallet_index(10)]
    pub type Balances = pallet_balances;

    #[runtime::pallet_index(11)]
    pub type TransactionPayment = pallet_transaction_payment;

    // Governance (15-19)
    #[runtime::pallet_index(15)]
    pub type Sudo = pallet_sudo; // Replace with governance in production

    // Consensus (20-29)
    #[runtime::pallet_index(20)]
    pub type Authorship = pallet_authorship;

    #[runtime::pallet_index(21)]
    pub type CollatorSelection = pallet_collator_selection;

    #[runtime::pallet_index(22)]
    pub type Session = pallet_session;

    #[runtime::pallet_index(23)]
    pub type Aura = pallet_aura;

    #[runtime::pallet_index(24)]
    pub type AuraExt = cumulus_pallet_aura_ext;

    // XCM (30-39)
    #[runtime::pallet_index(30)]
    pub type XcmpQueue = cumulus_pallet_xcmp_queue;

    #[runtime::pallet_index(31)]
    pub type PolkadotXcm = pallet_xcm;

    #[runtime::pallet_index(32)]
    pub type CumulusXcm = cumulus_pallet_xcm;

    #[runtime::pallet_index(33)]
    pub type MessageQueue = pallet_message_queue;

    // Smart Contracts (40-49)
    #[runtime::pallet_index(40)]
    pub type Revive = pallet_revive;

    // Custom Pallets (50+)
    #[runtime::pallet_index(50)]
    pub type DeploymentControl = pallet_deployment_control; // Custom pallet for whitelist
}
```

### 3.4 Consensus Configuration (Aura + Async Backing)

```rust
// Async backing parameters for 6s block times
mod async_backing_params {
    pub(crate) const UNINCLUDED_SEGMENT_CAPACITY: u32 = 3;
    pub(crate) const BLOCK_PROCESSING_VELOCITY: u32 = 1;
    pub(crate) const RELAY_CHAIN_SLOT_DURATION_MILLIS: u32 = 6000;
}

type ConsensusHook = cumulus_pallet_aura_ext::FixedVelocityConsensusHook<
    Runtime,
    RELAY_CHAIN_SLOT_DURATION_MILLIS,
    BLOCK_PROCESSING_VELOCITY,
    UNINCLUDED_SEGMENT_CAPACITY,
>;

impl pallet_aura::Config for Runtime {
    type AuthorityId = AuraId;
    type DisabledValidators = ();
    type MaxAuthorities = ConstU32<100_000>;
    type AllowMultipleBlocksPerSlot = ConstBool<true>;
    type SlotDuration = ConstU64<6000>; // 6 seconds
}
```

### 3.5 Collator Selection

```rust
parameter_types! {
    pub const PotId: PalletId = PalletId(*b"PotStake");
    pub const SessionLength: BlockNumber = 6 * HOURS;
}

impl pallet_collator_selection::Config for Runtime {
    type RuntimeEvent = RuntimeEvent;
    type Currency = Balances;
    type UpdateOrigin = EnsureRoot<AccountId>; // Or governance
    type PotId = PotId;
    type MaxCandidates = ConstU32<100>;
    type MinEligibleCollators = ConstU32<4>;
    type MaxInvulnerables = ConstU32<20>;
    type KickThreshold = Period;
    type ValidatorId = <Self as frame_system::Config>::AccountId;
    type ValidatorIdOf = pallet_collator_selection::IdentityCollator;
    type ValidatorRegistration = Session;
    type WeightInfo = ();
}
```

### 3.6 Genesis Configuration

```rust
use frame_support::build_struct_json_patch;

fn testnet_genesis(
    invulnerables: Vec<(AccountId, AuraId)>,
    endowed_accounts: Vec<AccountId>,
    root: AccountId,
    factory_account: AccountId, // ← Factory contract account
    id: ParaId,
) -> Value {
    build_struct_json_patch!(RuntimeGenesisConfig {
        balances: BalancesConfig {
            balances: endowed_accounts
                .iter()
                .cloned()
                .map(|k| (k, 100 * UNITS))
                .collect::<Vec<_>>(),
        },
        parachain_info: ParachainInfoConfig {
            parachain_id: id
        },
        collator_selection: CollatorSelectionConfig {
            invulnerables: invulnerables
                .iter()
                .cloned()
                .map(|(acc, _)| acc)
                .collect::<Vec<_>>(),
            candidacy_bond: EXISTENTIAL_DEPOSIT * 16,
        },
        session: SessionConfig {
            keys: invulnerables
                .into_iter()
                .map(|(acc, aura)| {
                    (
                        acc.clone(),
                        acc,
                        session_keys(aura),
                    )
                })
                .collect::<Vec<_>>(),
        },
        polkadot_xcm: PolkadotXcmConfig {
            safe_xcm_version: Some(SAFE_XCM_VERSION)
        },
        sudo: SudoConfig { key: Some(root) },
        deployment_control: DeploymentControlConfig {
            // Whitelist factory account at genesis
            whitelisted_deployers: vec![factory_account],
        },
    })
}
```

**Deploying Factory Contract at Genesis**:

Since pallet-revive doesn't directly support genesis contract deployment, use this pattern:

1. Fund a deployer account at genesis
2. Use sudo to deploy factory contract in first block
3. Add factory account to whitelist via governance/sudo
4. Optionally remove sudo after setup

---

## Implementation Roadmap

### Phase 1: Runtime Development

**Step 1.1: Set Up Runtime Template**
- [ ] Clone OpenZeppelin EVM template OR parachain template
- [ ] Configure Cargo.toml dependencies (add pallet-revive)
- [ ] Set up basic runtime structure

**Step 1.2: Configure Token Economics**
- [ ] Create constants.rs with DOT parameters (10 decimals!)
- [ ] Configure pallet-balances for DOT
- [ ] Configure pallet-transaction-payment with fee structure
- [ ] Set existential deposit to 0.1 DOT

**Step 1.3: Configure XCM**
- [ ] Create xcm_config.rs module
- [ ] Set up FungibleTransactor for DOT
- [ ] Configure IsReserve for relay chain
- [ ] Set up Trader for fee payment
- [ ] Configure pallet-xcm
- [ ] Configure XCM barriers (secure defaults!)

**Step 1.4: Add EVM Support**
- [ ] Add pallet-revive to runtime
- [ ] Configure basic settings (ChainId, gas limits)
- [ ] Set AllowEVMBytecode = true
- [ ] Configure precompiles (if needed)
- [ ] Add Ethereum transaction support

**Step 1.5: Implement Deployment Control**
- [ ] Create pallet-deployment-control (or add to existing custom pallet)
- [ ] Implement DeploymentWhitelist storage
- [ ] Implement EnsureFactoryOnly type
- [ ] Configure InstantiateOrigin = EnsureFactoryOnly
- [ ] Add governance calls to manage whitelist
- [ ] Write unit tests for permission logic

**Step 1.6: Consensus & Collators**
- [ ] Configure Aura consensus
- [ ] Enable async backing (6s blocks)
- [ ] Configure collator selection
- [ ] Set session keys configuration

**Step 1.7: Genesis Configuration**
- [ ] Create genesis config presets (development, testnet)
- [ ] Add factory deployer account to endowed accounts
- [ ] Configure initial collators
- [ ] Implement GenesisBuilder API

### Phase 2: Factory Contract Development

**Step 2.1: Design Factory Contract**
- [ ] Define deployment interface
- [ ] Decide on template restrictions (if any)
- [ ] Design fee structure
- [ ] Plan contract registry

**Step 2.2: Implement Factory Contract**
- [ ] Write Solidity factory contract
- [ ] Implement CREATE2 for deterministic addresses
- [ ] Add event emissions
- [ ] Add deployment tracking
- [ ] Optional: Template validation

**Step 2.3: Test Factory Contract**
- [ ] Unit tests for deployment logic
- [ ] Gas usage analysis
- [ ] Security audit considerations
- [ ] Integration tests with runtime

### Phase 3: Testing & Integration

**Step 3.1: Local Testing**
- [ ] Build runtime WASM
- [ ] Generate chain spec with chain-spec-builder
- [ ] Run omni-node in dev mode
- [ ] Test basic token transfers
- [ ] Test XCM reserve transfers (with Zombienet)

**Step 3.2: Factory Deployment Testing**
- [ ] Deploy factory contract via sudo
- [ ] Add factory to deployment whitelist
- [ ] Test direct deployment (should fail)
- [ ] Test factory-mediated deployment (should succeed)
- [ ] Test Ethereum JSON-RPC compatibility

**Step 3.3: XCM Testing**
- [ ] Set up Zombienet config (relay + parachain)
- [ ] Test DOT transfer relay → parachain
- [ ] Test fee payment with DOT
- [ ] Test parachain → relay transfers
- [ ] Test parachain → parachain transfers

**Step 3.4: Security Testing**
- [ ] Attempt deployment bypass attacks
- [ ] Test factory re-entrancy
- [ ] Verify whitelist cannot be bypassed
- [ ] Test XCM barrier configurations
- [ ] Audit all sudo/root privileged calls

### Phase 4: Production Preparation

**Step 4.1: Benchmarking**
- [ ] Run weight benchmarks for all pallets
- [ ] Update weight configurations
- [ ] Verify block weight limits

**Step 4.2: Governance Setup**
- [ ] Replace sudo with governance (optional)
- [ ] Set up tech committee (optional)
- [ ] Configure runtime upgrade process
- [ ] Document governance procedures

**Step 4.3: Documentation**
- [ ] Runtime documentation
- [ ] User guide for factory usage
- [ ] XCM integration guide
- [ ] Collator setup guide
- [ ] Emergency procedures

**Step 4.4: Deployment**
- [ ] Obtain parachain slot (auction or lease)
- [ ] Generate production chain spec
- [ ] Deploy parachain
- [ ] Deploy factory contract
- [ ] Configure whitelist
- [ ] Monitor initial operation

---

## Technical Challenges & Solutions

### Challenge 1: EVM Deployment Bypasses

**Problem**: Users might try to bypass restrictions via contract-to-contract creation.

**Solution**:
- The `InstantiateOrigin` check applies to top-level deployments only
- Contracts deployed by factory can create other contracts (this is intended)
- If you need to restrict contract-to-contract deployment, validate code in `UploadOrigin` instead
- Alternative: Audit factory contract to ensure it only deploys approved templates

### Challenge 2: DOT Decimal Confusion

**Problem**: Polkadot (10 decimals) vs Kusama/Rococo (12 decimals).

**Solution**:
- Use constants from `/polkadot/runtime/polkadot/constants/` for Polkadot
- Use constants from `/polkadot/runtime/kusama/constants/` for Kusama
- ALWAYS verify network before setting `UNITS` constant
- Document clearly in user-facing materials

### Challenge 3: Factory Contract Genesis Deployment

**Problem**: pallet-revive doesn't have genesis contract deployment.

**Solution**:
1. Fund deployer account at genesis
2. Create sudo call to deploy factory immediately after launch
3. Add factory to whitelist via sudo
4. Optionally remove sudo after setup
5. Alternative: Deploy via governance once network is live

### Challenge 4: XCM Fee Payment

**Problem**: Users need DOT on parachain to pay fees, but need DOT on relay to transfer.

**Solution**:
- Document clear user journey: Get DOT on relay → Transfer to parachain → Use dApp
- Consider faucet for testnet
- Optional: Implement fee sponsorship mechanism
- Optional: Add pallet-asset-conversion for paying fees with other assets

### Challenge 5: Weight Calibration

**Problem**: Inaccurate weights can cause DoS or expensive transactions.

**Solution**:
- Run full benchmarking suite before production
- Use conservative estimates during development
- Monitor block fullness and fee economics
- Iterate based on real usage data

---

## Security Considerations

### 1. Deployment Control Security

**Risks**:
- Factory contract bugs allow unrestricted deployment
- Whitelist management compromised
- Bypass via contract-to-contract creation

**Mitigations**:
- Audit factory contract thoroughly
- Use multi-sig or governance for whitelist updates
- Monitor on-chain for unexpected contract deployments
- Implement deployment rate limits in factory

### 2. XCM Security

**Risks**:
- Unpaid execution allows spam
- Reserve location misconfiguration leads to asset theft
- Barrier misconfiguration allows unauthorized calls

**Mitigations**:
- Use `AllowTopLevelPaidExecutionFrom<Everything>` not `AllowUnpaidExecutionFrom`
- Verify `IsReserve` configuration matches relay chain
- Test XCM barrier configurations thoroughly
- Monitor XCM message queue

### 3. Governance Security

**Risks**:
- Sudo key compromised
- Malicious runtime upgrade
- Whitelist manipulation

**Mitigations**:
- Use multi-sig for sudo key
- Implement time-locked runtime upgrades
- Add governance for whitelist management
- Monitor all privileged calls

### 4. Factory Contract Security

**Risks**:
- Re-entrancy attacks
- Gas griefing
- Malicious bytecode deployment

**Mitigations**:
- Follow Checks-Effects-Interactions pattern
- Set gas limits on internal calls
- Optional: Validate bytecode against approved templates
- Implement deployment fees to discourage spam

---

## Cost Estimates

### Development Costs

- **Runtime Development**: 4-6 weeks
- **Factory Contract**: 1-2 weeks
- **Testing & Integration**: 2-3 weeks
- **Security Audit**: 2-4 weeks (external)
- **Documentation**: 1 week

**Total**: ~10-16 weeks for complete implementation

### Operational Costs

- **Parachain Slot**: Varies (auction or on-demand)
- **Collator Infrastructure**: Cloud hosting (~$200-500/month)
- **Relay Chain Fees**: Minimal for message passing
- **Maintenance**: Ongoing runtime upgrades, monitoring

---

## Alternative Architectures (Considered & Rejected)

### Alternative 1: pallet-contracts Instead of pallet-revive

**Pros**:
- More mature, battle-tested
- Better documentation

**Cons**:
- Uses ink! smart contracts (not EVM)
- Requires users to learn new tooling
- Less Ethereum ecosystem compatibility

**Verdict**: Rejected - EVM compatibility is a hard requirement

### Alternative 2: Frontier (pallet-evm) Instead of pallet-revive

**Pros**:
- More mature EVM implementation
- Widely used in production (Moonbeam, Astar)

**Cons**:
- pallet-revive is the future direction for Polkadot SDK
- Frontier maintenance status unclear
- pallet-revive has better Substrate integration

**Verdict**: pallet-revive preferred, but Frontier is viable fallback

### Alternative 3: Custom Parachain Token Instead of DOT

**Pros**:
- Simpler initial setup
- Full control over token economics
- No XCM complexity

**Cons**:
- Doesn't meet requirement of DOT as native token
- Less seamless UX (users need to acquire custom token)

**Verdict**: Rejected - DOT requirement is fixed

### Alternative 4: Blocklist Instead of Whitelist

**Description**: Allow all deployments except blacklisted accounts.

**Pros**:
- More permissionless
- Easier initial UX

**Cons**:
- Doesn't meet requirement (only factory should deploy)
- Reactive instead of proactive security

**Verdict**: Rejected - whitelist matches requirements better

---

## Key Metrics for Success

### Technical Metrics

- **Block Time**: 6 seconds (async backing)
- **Block Finality**: ~12 seconds (2 relay blocks)
- **TPS**: 50-100 transactions per second (depends on transaction complexity)
- **Factory Deployment Success Rate**: >99%
- **XCM Transfer Success Rate**: >99.9%
- **Node Uptime**: >99.9%

### Security Metrics

- **Direct Deployment Attempts Blocked**: 100%
- **Factory-Mediated Deployments Allowed**: 100%
- **XCM Reserve Verification**: 100% correct
- **No Unauthorized Whitelist Changes**: 100%

### Economic Metrics

- **Existential Deposit**: 0.1 DOT (1/10 of relay chain)
- **Average Transaction Fee**: <0.01 DOT
- **Contract Deployment Fee**: Set by factory (e.g., 0.1 DOT)
- **Collator Bond**: 100-1000 DOT (configurable)

---

## References & Resources

### Polkadot SDK Documentation

- **pallet-revive**: `/substrate/frame/revive/`
- **Parachain Template**: `/templates/parachain/`
- **Omni-Node**: `/cumulus/polkadot-omni-node/`
- **XCM Docs**: `/polkadot/xcm/`
- **Asset Hub Reference**: `/cumulus/parachains/runtimes/assets/asset-hub-rococo/`

### External Resources

- OpenZeppelin Templates: https://github.com/OpenZeppelin/polkadot-runtime-templates
- Polkadot SDK Docs: https://paritytech.github.io/polkadot-sdk/master/
- Async Backing Guide: https://wiki.polkadot.network/docs/maintain-guides-async-backing
- XCM Format: https://wiki.polkadot.network/docs/learn-xcm

### Key Constants References

- Polkadot Constants: `/polkadot/runtime/polkadot/constants/src/lib.rs`
- Parachain Constants: `/cumulus/parachains/runtimes/constants/src/polkadot.rs`
- Rococo Constants: `/polkadot/runtime/rococo/constants/src/lib.rs`

---

## Conclusion

This scoping document provides a complete technical blueprint for building a DOT-native EVM parachain with restricted deployment via factory contract pattern. The architecture leverages:

1. **pallet-revive** for EVM compatibility with Substrate-native patterns
2. **Custom EnsureOrigin** for clean, maintainable deployment restrictions
3. **XCM reserve transfers** for DOT as native token
4. **Omni-node** for minimal node code maintenance
5. **Factory contract** as the sole deployment gateway

The recommended implementation path follows Polkadot SDK best practices while meeting all stated requirements. Total development timeline is estimated at 10-16 weeks including testing and security audit.

**Next Steps**:
1. Review and approve architecture
2. Set up development environment
3. Begin Phase 1: Runtime Development
4. Engage security auditors early in process
