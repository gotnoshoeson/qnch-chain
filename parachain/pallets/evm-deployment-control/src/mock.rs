use crate as pallet_evm_deployment_control;
use frame_support::{
	derive_impl, parameter_types,
	traits::{ConstU32, ConstU64},
};
use sp_runtime::{traits::IdentityLookup, BuildStorage};

type Block = frame_system::mocking::MockBlock<Test>;

// Configure a mock runtime to test the pallet.
frame_support::construct_runtime!(
	pub enum Test
	{
		System: frame_system,
		EvmDeploymentControl: pallet_evm_deployment_control,
	}
);

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
	type Block = Block;
	type AccountId = u64;
	type Lookup = IdentityLookup<Self::AccountId>;
}

impl pallet_evm_deployment_control::Config for Test {
	type RuntimeEvent = RuntimeEvent;
	type WeightInfo = ();
}

// Build genesis storage according to the mock runtime.
pub fn new_test_ext() -> sp_io::TestExternalities {
	let mut storage = frame_system::GenesisConfig::<Test>::default().build_storage().unwrap();

	// Configure initial authorized deployers for testing
	pallet_evm_deployment_control::GenesisConfig::<Test> {
		authorized_deployers: vec![1, 2], // Alice and Bob are pre-authorized
	}
	.assimilate_storage(&mut storage)
	.unwrap();

	storage.into()
}
