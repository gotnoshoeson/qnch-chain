use crate::{mock::*, Error, Event};
use frame_support::{assert_noop, assert_ok};

#[test]
fn genesis_config_works() {
	new_test_ext().execute_with(|| {
		// Verify genesis deployers are authorized
		assert!(EvmDeploymentControl::is_authorized(&1));
		assert!(EvmDeploymentControl::is_authorized(&2));
		// Account 3 should not be authorized
		assert!(!EvmDeploymentControl::is_authorized(&3));
	});
}

#[test]
fn authorize_deployer_works() {
	new_test_ext().execute_with(|| {
		// Initialize block 1 so events are recorded
		System::set_block_number(1);

		// Account 3 starts unauthorized
		assert!(!EvmDeploymentControl::is_authorized(&3));

		// Root authorizes account 3
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), 3));

		// Verify account 3 is now authorized
		assert!(EvmDeploymentControl::is_authorized(&3));

		// Verify event was emitted
		System::assert_last_event(
			Event::DeployerAuthorized { deployer: 3 }.into()
		);
	});
}

#[test]
fn authorize_deployer_requires_root() {
	new_test_ext().execute_with(|| {
		// Non-root account cannot authorize
		assert_noop!(
			EvmDeploymentControl::authorize_deployer(RuntimeOrigin::signed(1), 3),
			sp_runtime::DispatchError::BadOrigin
		);

		// Account 3 should still be unauthorized
		assert!(!EvmDeploymentControl::is_authorized(&3));
	});
}

#[test]
fn authorize_already_authorized_is_noop() {
	new_test_ext().execute_with(|| {
		// Account 1 is already authorized in genesis
		assert!(EvmDeploymentControl::is_authorized(&1));

		// Authorizing again should fail
		assert_noop!(
			EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), 1),
			Error::<Test>::AlreadyAuthorized
		);
	});
}

#[test]
fn revoke_deployer_works() {
	new_test_ext().execute_with(|| {
		// Initialize block 1 so events are recorded
		System::set_block_number(1);

		// Account 1 starts authorized
		assert!(EvmDeploymentControl::is_authorized(&1));

		// Root revokes account 1
		assert_ok!(EvmDeploymentControl::revoke_deployer(RuntimeOrigin::root(), 1));

		// Verify account 1 is no longer authorized
		assert!(!EvmDeploymentControl::is_authorized(&1));

		// Verify event was emitted
		System::assert_last_event(
			Event::DeployerRevoked { deployer: 1 }.into()
		);
	});
}

#[test]
fn revoke_deployer_requires_root() {
	new_test_ext().execute_with(|| {
		// Non-root account cannot revoke
		assert_noop!(
			EvmDeploymentControl::revoke_deployer(RuntimeOrigin::signed(2), 1),
			sp_runtime::DispatchError::BadOrigin
		);

		// Account 1 should still be authorized
		assert!(EvmDeploymentControl::is_authorized(&1));
	});
}

#[test]
fn revoke_unauthorized_deployer_fails() {
	new_test_ext().execute_with(|| {
		// Account 3 is not authorized
		assert!(!EvmDeploymentControl::is_authorized(&3));

		// Revoking non-authorized account should fail
		assert_noop!(
			EvmDeploymentControl::revoke_deployer(RuntimeOrigin::root(), 3),
			Error::<Test>::NotAuthorized
		);
	});
}

#[test]
fn multiple_authorizations_work() {
	new_test_ext().execute_with(|| {
		// Authorize multiple accounts
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), 3));
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), 4));
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), 5));

		// Verify all are authorized
		assert!(EvmDeploymentControl::is_authorized(&1)); // Genesis
		assert!(EvmDeploymentControl::is_authorized(&2)); // Genesis
		assert!(EvmDeploymentControl::is_authorized(&3)); // Added
		assert!(EvmDeploymentControl::is_authorized(&4)); // Added
		assert!(EvmDeploymentControl::is_authorized(&5)); // Added

		// Account 6 should not be authorized
		assert!(!EvmDeploymentControl::is_authorized(&6));
	});
}

#[test]
fn authorize_and_revoke_cycle_works() {
	new_test_ext().execute_with(|| {
		let account = 10;

		// Initially not authorized
		assert!(!EvmDeploymentControl::is_authorized(&account));

		// Authorize
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), account));
		assert!(EvmDeploymentControl::is_authorized(&account));

		// Revoke
		assert_ok!(EvmDeploymentControl::revoke_deployer(RuntimeOrigin::root(), account));
		assert!(!EvmDeploymentControl::is_authorized(&account));

		// Re-authorize
		assert_ok!(EvmDeploymentControl::authorize_deployer(RuntimeOrigin::root(), account));
		assert!(EvmDeploymentControl::is_authorized(&account));
	});
}

#[test]
fn storage_query_is_efficient() {
	new_test_ext().execute_with(|| {
		// Multiple queries should work efficiently
		for _ in 0..100 {
			let _ = EvmDeploymentControl::is_authorized(&1);
			let _ = EvmDeploymentControl::is_authorized(&999);
		}
	});
}
