//! Benchmarking setup for pallet-evm-deployment-control

use super::*;

#[allow(unused)]
use crate::Pallet as EvmDeploymentControl;
use frame_benchmarking::v2::*;
use frame_system::RawOrigin;

#[benchmarks]
mod benchmarks {
	use super::*;

	#[benchmark]
	fn authorize_deployer() {
		let deployer: T::AccountId = account("deployer", 0, 0);

		#[extrinsic_call]
		_(RawOrigin::Root, deployer.clone());

		// Verify the deployer was authorized
		assert!(AuthorizedDeployers::<T>::contains_key(&deployer));
	}

	#[benchmark]
	fn revoke_deployer() {
		// Setup: First authorize a deployer
		let deployer: T::AccountId = account("deployer", 0, 0);
		AuthorizedDeployers::<T>::insert(&deployer, ());

		#[extrinsic_call]
		_(RawOrigin::Root, deployer.clone());

		// Verify the deployer was revoked
		assert!(!AuthorizedDeployers::<T>::contains_key(&deployer));
	}

	#[benchmark]
	fn is_authorized_check() {
		// Setup: Authorize a deployer
		let deployer: T::AccountId = account("deployer", 0, 0);
		AuthorizedDeployers::<T>::insert(&deployer, ());

		#[block]
		{
			let _ = Pallet::<T>::is_authorized(&deployer);
		}
	}

	impl_benchmark_test_suite!(EvmDeploymentControl, crate::mock::new_test_ext(), crate::mock::Test);
}
