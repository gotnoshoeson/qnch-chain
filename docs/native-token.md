# [UXB-2] - DOT as a Universal Fee Token - Integration Guide

<aside>
<img src="/icons/help-alternate_purple.svg" alt="/icons/help-alternate_purple.svg" width="40px" /> **FAQ**

- **Why is this needed?**
    
    Using Polkadot should be as simple as possible for users. Requiring users to own the native token for every parachain they interact with creates significant a UX barrier. This initiative aims to address this barrier and at the same time allow for:
    
    - Simplified liquidity by eliminating the need to purchase multiple native tokens lowers entry barriers for users.
    - Improved onboarding with a process ensuring users feel welcome and engaged within the Polkadot ecosystem.
    - No trapped assets as users can move assets freely without additional token purchases.
    
    ---
    
- **What are the risks? How can they be mitigated?**
    1. Users may use DOT instead of the parachain’s native token for fees.
        - **Mitigation**: We have added to each method their Pros & Cons to help you decide what is the best for your project.
    2. DApps and wallets will require updates to accommodate DOT as a gas token.
        - **Mitigation**: We have created [UX/UI best practices](https://www.notion.so/UXB-2-DOT-as-a-Universal-Fee-Token-Integration-Guide-13de1c2781f380d5bd95fc0020b8d509?pvs=21) to help speed up the process.
    
    ---
    
- **What happens if I don’t adopt DOT as a gas token?**
    
    While adopting DOT is not mandatory, opting out may result in:
    
    - Inconsistent UX with the rest of the ecosystem, which will confuse users and eventually impact your project’s competitiveness.
    - Increased frustration from your users that will face more complexity when interacting with your parachain.
    - Missing opportunities to increase your project’s adoption as the ecosystem evolves.
    
    ---
    
- **What are the next steps?**
    1. **Choose your Method**:
        - **Method 1**: Accept DOT natively for simpler integration and reduced complexity.
        - **Method 2**: Swap DOT to your native token using `pallet_asset_conversion`.
    2. **Coordinate implementation in your ecosystem**:
        - Update your wallets and dApps so they update their UI.
        - If needed, ask us for guidance, resources, and support.
    3. **Keep your users informed**:
        - Announce updates through your communication channels to ensure smooth adoption.
    
    ---
    
</aside>

# GM 👋

---

This guide will showcase how you can integrate DOT into your chain so that it can be used as a fee token. We will cover two main methods to doing this, allowing you to choose the one that suits you and your project best.

Support from Remy & Cisco from Parity Engineering and multiple technical ecosystem agents will be available throughout the integration process.

<aside>
<img src="/icons/circle-alternate_green.svg" alt="/icons/circle-alternate_green.svg" width="40px" />

This initiative falls under the UX Bounty scope and the necessary resources will be covered by its budget. You can find all relevant materials [here.](https://www.notion.so/UXB-2-Unified-Gas-Token-e915b7f7506d48608611e0266722b926?pvs=21)

</aside>

<aside>
<img src="/icons/checkmark_blue.svg" alt="/icons/checkmark_blue.svg" width="40px" />

Use [the checklist](https://www.notion.so/159e1c2781f3809cb731e4699f277382?pvs=21) to not forget anything while upgrading!

</aside>

<aside>
<img src="/icons/info-alternate_blue.svg" alt="/icons/info-alternate_blue.svg" width="40px" />

If you’d like to explore **‘why’** Polkadot benefits from universally supporting DOT as a fee token, then please see the **forum post** which can be found [here](https://forum.polkadot.network/t/unlocking-liquidity-dot-as-a-unified-gas-token/10424). This provides a high-level overview of the key pain points, how we can solve it and the benefits to the ecosystem.

</aside>

# Table of Content

---

# Integration Guides

---

## Method 1 - Integrating DOT natively into your runtime

---

### Introduction

Integrating DOT natively into your runtime. This method allows the parachain to natively accept DOT as a gas fee in the runtime without swaps.

### Pros

No need to configure pallet_asset_conversion and set up liquidity pools.

The chain needs DOT for coretime, so accepting it directly builds up some DOT that can be used in the future.

### Cons

DOT can now be used for fees, potentially decreasing usage of the parachain’s native token for fees.

Need to have a reliable way of knowing the exchange rate between DOT and your parachain’s native token, this could be using an oracle or querying a DEX for it.

### A step by step

You need `pallet_asset_tx_payment` for paying fees in multiple assets. You should include both this pallet and the common `pallet-transaction-payment` in your runtime but only this pallets extension in your signed extensions.

```rust
impl pallet_asset_tx_payment::Config for Runtime {
	type Fungibles = ForeignAssets;
	type OnChargeAssetTransaction = /* A type that implements OnChargeAssetTransaction */;
	type RuntimeEvent = RuntimeEvent;
}

pub type SignedExtra = (
	...
	---pallet_transaction_payment::ChargeTransactionPayment<Runtime>,
	+++pallet_asset_tx_payment::ChargeAssetTxPayment<Runtime>,
	...
);
```

An example of a type that implements `OnChargeAssetTransaction` is in the Polimec PR.

As well as that, you’re going to need some way of getting the correct price. One option is using an oracle, like [the oracle pallet from ORML](https://github.com/open-web3-stack/open-runtime-module-library/tree/master/oracle). Polimec made [a pallet for creating a price oracle by querying CEXs with an offchain worker](https://github.com/Polimec/polimec-node/tree/main/pallets/oracle-ocw).

### Example PRs

- Polimec: https://github.com/Polimec/polimec-node/pull/403 (with USDT instead of DOT)

## Method 2 - Using pallet_asset_conversion

---

### Introduction

The usage of pallet_asset_conversion allows the parachain to swap DOT to your native token under the hood.

### Pros

Many different tokens could be used for fees as long as they’re in a pool with the parachain’s native token.

### Cons

Configuring the pallet and setting up the liquidity pools is definitely more complicated than method 1.

There can be issues with high slippage when doing swaps and fragmented liquidity.

### A step by step

The example PRs are a very good source to know what changes need to be done for this method.

However, we’ll give a step by step overview of what’s needed.

Three new pallets are needed on your parachain’s runtime:

- PoolAssets: an instance of pallet_assets to hold assets in liquidity pools
    - If you already have an instance of pallet_assets in your runtime, then you need to use `Instance2` to specify it’s a different instance, if you have more you use `Instance3`, `Instance4` etc. This is shown as `InstanceX` in the snippet bel
- AssetConversion: pallet_asset_conversion to handle liquidity pools and swaps
- AssetConversionTxPayment: pallet_asset_conversion_tx_payment to handle automatically paying transaction fees via swaps if needed.

This is how that looks like on the runtime configuration:

```rust
use pallet_assets::InstanceX;

construct_runtime! {
  ...
  
  PoolAssets: pallet_assets::<InstanceX> = N;
  AssetConversion: pallet_asset_conversion = N + 1;
  AssetConversionTxPayment: pallet_asset_conversion_tx_payment = N + 2;
  
  ...
}
```

Each of these pallets will need to be configured. We’ll look at all of them in turn.

**PoolAssets**

```rust
type NumericAssetId = u32; // Put whatever id you use for assets.

impl pallet_assets::Config<InstanceX> for Runtime {
	type RuntimeEvent = RuntimeEvent;
	type Balance = Balance;
	type RemoveItemsLimit = ConstU32<1000>;
	type AssetId = NumericAssetId;
	type AssetIdParameter = u32;
	type Currency = Balances;
	type CreateOrigin =
		AsEnsureOriginWithArg<EnsureSignedBy<AssetConversionOrigin, sp_runtime::AccountId32>>;
	type ForceOrigin = EnsureRoot<AccountId>;
	// Deposits are zero because creation/admin is limited to Asset Conversion pallet.
	type AssetDeposit = ConstU128<0>;
	type AssetAccountDeposit = ConstU128<0>;
	type MetadataDepositBase = ConstU128<0>;
	type MetadataDepositPerByte = ConstU128<0>;
	type ApprovalDeposit = ExistentialDeposit;
	type StringLimit = ConstU32<50>;
	type Freezer = ();
	type Extra = ();
	type WeightInfo = weights::pallet_assets::WeightInfo<Runtime>;
	type CallbackHandle = ();
	#[cfg(feature = "runtime-benchmarks")]
	type BenchmarkHelper = ();
}
```

**AssetConversion**

The asset conversion pallet needs a type that implements the `fungibles::*` family of traits, this is usually something like pallet-assets.

pallet-balances, which tends to be used for managing the native token of a chain, implements the `fungible::*` family of traits, note the missing “s”!

To unify the native token in the balances pallet and any other asset in the assets pallet, we use a type `UnionOf`:

```rust
pub type NativeAndAssets = UnionOf<
	Balances,
	Assets,
	NativeFromLeft,
	NativeOrWithId<NumericAssetId>,
	AccountId,
>;
```

If you use XCM Locations as ids for other assets, you can find an example of this in the [asset hub runtime](https://github.com/polkadot-fellows/runtimes/blob/db4bb534cb411c0d6a2fe57eb331e6ec93ace825/system-parachains/asset-hubs/asset-hub-polkadot/src/lib.rs#L911).

The pallet also needs a way to derive an address for a pool given the pair of assets that go in it. This is called the `PoolLocator`. The pallet itself provides some options for the locator:

- `WithFirstAsset`: Mandates the inclusion of a specific asset in a pair.
- `Ascending`: Assets should be in ascending order.
- `Chain`: Utility for chaining multiple locators.

If you’re only allowing pools with DOT, then `WithFirstAsset` is a good choice to make sure no pools without DOT can be created. `Ascending` is an optional utility which can be good to `Chain` together with the first one.

```rust
pub type AscendingLocator =
	Ascending<AccountId, NativeOrWithId<NumericAssetId>, PoolIdToAccountId>;

pub type WithFirstAssetLocator = WithFirstAsset<
	Native,
	AccountId,
	NativeOrWithId<NumericAssetId>,
	PoolIdToAccountId,
>;

impl pallet_asset_conversion::Config for Runtime {
	type RuntimeEvent = RuntimeEvent;
	type Balance = Balance;
	type HigherPrecisionBalance = sp_core::U256;
	type AssetKind = NativeOrWithId<NumericAssetId>;
	type Assets = NativeAndAssets; // The unified assets type built before.
	type PoolId = (Self::AssetKind, Self::AssetKind); // The ID for a pool is the tuple of both assets that go in it.
	type PoolLocator = Chain<WithFirstAssetLocator, AscendingLocator>;
	type PoolAssetId = u32;
	type PoolAssets = PoolAssets; // The instance of the assets pallet.
	type PoolSetupFee = ConstU128<0>; // Asset class deposit fees are sufficient to prevent spam
	type PoolSetupFeeAsset = Native;
	type PoolSetupFeeTarget = ResolveAssetTo<AssetConversionOrigin, Self::Assets>;
	type LiquidityWithdrawalFee = LiquidityWithdrawalFee;
	type LPFee = ConstU32<3>; // 0.3% swap fee
	type PalletId = AssetConversionPalletId;
	type MaxSwapPathLength = ConstU32<3>;
	type MintMinLiquidity = ConstU128<100>;
	type WeightInfo = weights::pallet_asset_conversion::WeightInfo<Runtime>;
	#[cfg(feature = "runtime-benchmarks")]
	type BenchmarkHelper = ();
}
```

**AssetConversionTxPayment**

The asset conversion tx payment pallet has a very small configuration.

Make sure to change the `ChargeTransactionPayment` signed extension to `ChargeAssetTxPayment` coming from this pallet.

```rust
impl pallet_asset_conversion_tx_payment::Config for Runtime {
	type RuntimeEvent = RuntimeEvent;
	type Fungibles = NativeAndAssets;
	type OnChargeAssetTransaction = tx_payment::SwapCreditAdapter<Native, AssetConversion>;
}

type SignedExtra = (
	---	pallet_transaction_payment::ChargeTransactionPayment<Runtime>,
	+++	pallet_asset_conversion_tx_payment::ChargeAssetTxPayment<Runtime>,
)
```

### Example PRs

- Ajuna: https://github.com/ajuna-network/ajuna-parachain/pull/58

## Regardless of the method

---

Once you change the runtime to accept DOT as fee payment. You need to communicate with wallets and apps how to make use of this change.

By 

Once you accept DOT as a fee token, make sure to let users know.

If you are using the `XcmPaymentApi` to let UIs estimate fees, then make sure to change `query_acceptable_payment_assets` and `query_weight_to_asset_fee` to account for DOT:

```rust
		fn query_acceptable_payment_assets(xcm_version: xcm::Version) -> Result<Vec<VersionedAssetId>, XcmPaymentApiError> {
			let acceptable_assets = vec![
				xcm_config::HereLocation::get().into(), // Parachain native token
				xcm_config::DotLocation::get().into(), // DOT
			];

			PolkadotXcm::query_acceptable_payment_assets(xcm_version, acceptable_assets)
		}

		fn query_weight_to_asset_fee(weight: Weight, asset: VersionedAssetId) -> Result<u128, XcmPaymentApiError> {
			match xcm::v3::AssetId::try_from(asset) {
				Ok(xcm::v3::AssetId::Concrete(location)) if location == Location::here() => {
					// for native token
					Ok(TransactionPayment::weight_to_fee(weight))
				},
				Ok(xcm::v3::AssetId::Concrete(location)) => {
					let native_fee = TransactionPayment::weight_to_fee(weight);
					let asset_id = /* Identify asset from location */
					let amount = /*
						Convert `native_fee` to fee in `asset_id`.
						Depends on the method used.
					*/
				},
				_ => {
					Err(XcmPaymentApiError::VersionedConversionFailed)
				}
			}
		}
```

# UX/UI Best Practices & Considerations

---

We’ve created wireframes to help speed up your work.

Please note that these designs haven’t been tested. We’ve simplified the existing solutions offered by Bifrost and Hydration to propose an optimized experience.

## Simple Option: Toggle Switch

---

<aside>
<img src="/icons/info-alternate_blue.svg" alt="/icons/info-alternate_blue.svg" width="40px" />

[Switch Gas Token.mp4](https://prod-files-secure.s3.us-west-2.amazonaws.com/ceee5aeb-a41f-49af-8a17-4558c7d278bf/13a78cf8-8b29-4958-8a12-a44108621d1f/Switch_Gas_Token.mp4)

Use the [Figma board](https://www.figma.com/design/vlRja4vG7SjENyZxZlSit8/%5BUX-Bounty%5D---UX%2FUI-Best-Practices?node-id=128-67741&t=B5s0IEw8JA6o0NWH-0) to copy/paste the designs.

https://www.figma.com/design/vlRja4vG7SjENyZxZlSit8/%5BUX-Bounty%5D---UX%2FUI-Best-Practices?node-id=128-67741&t=B5s0IEw8JA6o0NWH-0

</aside>

![UXB-2 - Slide 1.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/ceee5aeb-a41f-49af-8a17-4558c7d278bf/2d455206-8c28-4677-bbc3-27ea8a501e86/UXB-2_-_Slide_1.png)

![UXB-2 - Slide 2.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/ceee5aeb-a41f-49af-8a17-4558c7d278bf/cb351a9d-6377-4704-8acd-2664a324fbee/UXB-2_-_Slide_2.png)

![UXB-2 - Slide 3.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/ceee5aeb-a41f-49af-8a17-4558c7d278bf/c1976b64-24ee-4c06-aa9b-7ca1f18939eb/UXB-2_-_Slide_3.png)

![UXB-2 - Slide 4.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/ceee5aeb-a41f-49af-8a17-4558c7d278bf/d107de2e-b27b-4e7c-871f-688716b67692/UXB-2_-_Slide_4.png)

## Alternative Option

---

<aside>
<img src="/icons/warning_yellow.svg" alt="/icons/warning_yellow.svg" width="40px" />

We have also designed a more comprehensive (and complex) solution that you can [find here.](https://www.figma.com/design/vlRja4vG7SjENyZxZlSit8/%5BUX-Bounty%5D---UX%2FUI-Best-Practices?node-id=13-8477&p=f&t=xOrNLXjkkHR7CJtv-0) Don’t hesitate to contact us if you need a walkthrough.

https://www.figma.com/design/vlRja4vG7SjENyZxZlSit8/%5BUX-Bounty%5D---UX%2FUI-Best-Practices?node-id=13-8477&p=f&t=xOrNLXjkkHR7CJtv-0

</aside>

## UX/UI Considerations

---

<aside>
<img src="/icons/info-alternate_blue.svg" alt="/icons/info-alternate_blue.svg" width="40px" />

It is recommended to notify wallet teams when implementing this feature, as they are often the primary user interface for changing the gas fee token.

</aside>

### **Communicating UX Updates After Integration**

Make sure that you are properly informing your users of any proper update in the project UX with an update announcement, and if possible - a notification message inside the dApp. 
Simplifying the process of switching their gas fee token to DOT without adding unnecessary complexity removes barriers and ensures users can adopt the new feature effortlessly.

### **Designing an intuitive and easy to read UI**

It’s essential to evaluate your current UI to ensure users can easily understand that DOT is now available as a unified gas fee token. Clear labeling and intuitive design are key to making this functionality visible and straightforward for both existing and future users.

### **Keeping Your Community and Partners Informed**

When introducing this change, keep your community, partners, and stakeholders in the loop. They may need to adjust parameters on their end to maintain a smooth, uninterrupted experience. 

# Need help?

---

Feel free to [reach out to us directly on Telegram](https://t.me/+mI4O_frwPJozMTMx) ****— we’re happy to provide guidance, answer your questions, or offer hands-on support to ensure a smooth integration for your parachain 😊

If you have questions on the UX/UI you can also reach out.
