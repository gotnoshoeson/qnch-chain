#![cfg_attr(not(feature = "std"), no_std)]

//! # EVM Deployment Control Pallet
//!
//! A pallet for managing authorized EVM contract deployers.
//!
//! ## Overview
//!
//! This pallet maintains a whitelist of accounts authorized to deploy
//! smart contracts to the EVM. It integrates with pallet-evm's
//! `WithdrawOrigin` to enforce deployment restrictions at the runtime level.
//!
//! ## Features
//!
//! - Root-controlled authorization of deployers
//! - Query interface for checking authorization status
//! - Genesis configuration for initial deployers
//! - Events for tracking authorization changes
//!
//! ## Example Usage
//!
//! ```rust,ignore
//! // Check if an account is authorized
//! if EvmDeploymentControl::is_authorized(&account) {
//!     // Allow deployment
//! } else {
//!     // Reject deployment
//! }
//! ```

pub use pallet::*;
pub mod weights;

/// Custom validation errors for deployment control
/// These error codes are used in transaction validation to provide
/// specific error messages to users via the RPC layer
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeploymentValidationError {
    /// Deployer is not authorized to deploy contracts
    UnauthorizedDeployer = 0,
}

impl From<DeploymentValidationError> for u8 {
    fn from(err: DeploymentValidationError) -> u8 {
        err as u8
    }
}

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

#[frame_support::pallet]
pub mod pallet {
	use frame_support::pallet_prelude::*;
	use frame_system::pallet_prelude::*;
	use sp_std::vec::Vec;

	pub use crate::weights::WeightInfo;

	#[pallet::config]
	pub trait Config: frame_system::Config {
		/// The overarching event type
		#[allow(deprecated)]
		type RuntimeEvent: From<Event<Self>>
			+ IsType<<Self as frame_system::Config>::RuntimeEvent>;

		/// Weight information for extrinsics in this pallet
		type WeightInfo: WeightInfo;
	}

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	/// Storage map of authorized EVM deployers
	///
	/// Accounts in this map are permitted to deploy contracts directly to the EVM.
	/// Regular users must deploy through approved factory contracts.
	#[pallet::storage]
	#[pallet::getter(fn is_authorized_storage)]
	pub type AuthorizedDeployers<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, (), OptionQuery>;

	#[pallet::genesis_config]
	pub struct GenesisConfig<T: Config> {
		/// Initial list of authorized deployers
		///
		/// Typically includes the sudo account and any initial governance accounts.
		pub authorized_deployers: Vec<T::AccountId>,
	}

	impl<T: Config> Default for GenesisConfig<T> {
		fn default() -> Self {
			Self { authorized_deployers: Vec::new() }
		}
	}

	#[pallet::genesis_build]
	impl<T: Config> BuildGenesisConfig for GenesisConfig<T> {
		fn build(&self) {
			for deployer in &self.authorized_deployers {
				AuthorizedDeployers::<T>::insert(deployer, ());
			}
		}
	}

	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		/// A deployer was authorized to deploy EVM contracts
		DeployerAuthorized {
			/// The account that was authorized
			deployer: T::AccountId
		},
		/// A deployer's authorization was revoked
		DeployerRevoked {
			/// The account that was revoked
			deployer: T::AccountId
		},
	}

	#[pallet::error]
	pub enum Error<T> {
		/// Account is already authorized
		AlreadyAuthorized,
		/// Account is not authorized
		NotAuthorized,
	}

	#[pallet::call]
	impl<T: Config> Pallet<T> {
		/// Authorize an account to deploy EVM contracts
		///
		/// This allows the specified account to deploy contracts directly to the EVM,
		/// bypassing the factory contract requirement.
		///
		/// # Parameters
		/// - `origin`: Must be Root (typically called via sudo or governance)
		/// - `deployer`: The account to authorize
		///
		/// # Errors
		/// - `AlreadyAuthorized`: The account is already in the authorized list
		///
		/// # Events
		/// - `DeployerAuthorized`: Emitted when authorization succeeds
		#[pallet::call_index(0)]
		#[pallet::weight(T::WeightInfo::authorize_deployer())]
		pub fn authorize_deployer(
			origin: OriginFor<T>,
			deployer: T::AccountId,
		) -> DispatchResult {
			ensure_root(origin)?;

			ensure!(
				!AuthorizedDeployers::<T>::contains_key(&deployer),
				Error::<T>::AlreadyAuthorized
			);

			AuthorizedDeployers::<T>::insert(&deployer, ());
			Self::deposit_event(Event::DeployerAuthorized { deployer });

			Ok(())
		}

		/// Revoke an account's authorization to deploy EVM contracts
		///
		/// This removes the account from the authorized deployers list, preventing
		/// them from deploying contracts directly to the EVM.
		///
		/// # Parameters
		/// - `origin`: Must be Root (typically called via sudo or governance)
		/// - `deployer`: The account to revoke
		///
		/// # Errors
		/// - `NotAuthorized`: The account is not in the authorized list
		///
		/// # Events
		/// - `DeployerRevoked`: Emitted when revocation succeeds
		#[pallet::call_index(1)]
		#[pallet::weight(T::WeightInfo::revoke_deployer())]
		pub fn revoke_deployer(
			origin: OriginFor<T>,
			deployer: T::AccountId,
		) -> DispatchResult {
			ensure_root(origin)?;

			ensure!(
				AuthorizedDeployers::<T>::contains_key(&deployer),
				Error::<T>::NotAuthorized
			);

			AuthorizedDeployers::<T>::remove(&deployer);
			Self::deposit_event(Event::DeployerRevoked { deployer });

			Ok(())
		}
	}

	impl<T: Config> Pallet<T> {
		/// Check if an account is authorized to deploy EVM contracts
		///
		/// This is the primary query interface used by the EVM's deployment control logic.
		///
		/// # Parameters
		/// - `account`: The account to check
		///
		/// # Returns
		/// `true` if the account is authorized, `false` otherwise
		pub fn is_authorized(account: &T::AccountId) -> bool {
			AuthorizedDeployers::<T>::contains_key(account)
		}
	}
}
