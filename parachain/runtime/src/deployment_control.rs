use pallet_evm::{AddressMapping, EnsureAddressOrigin};
use sp_core::H160;
use sp_std::marker::PhantomData;

/// EVM deployment control using pallet-evm-deployment-control
///
/// This implementation enforces that only authorized deployers (managed by
/// the pallet-evm-deployment-control pallet) can deploy contracts directly to the EVM.
///
/// Authorization is managed through the EvmDeploymentControl pallet via root/sudo:
/// - Sudo can authorize new deployers: `authorizeDeployer(account)`
/// - Sudo can revoke deployers: `revokeDeployer(account)`
/// - Regular users must deploy through pre-approved factory contracts
///
/// This provides runtime-level enforcement of deployment restrictions,
/// which is more secure than application-level enforcement alone.
pub struct EnsureSudoCanDeploy<T, I = ()>(PhantomData<(T, I)>);

impl<T, I> EnsureAddressOrigin<T::RuntimeOrigin> for EnsureSudoCanDeploy<T, I>
where
    T: frame_system::Config + pallet_evm_deployment_control::Config + pallet_evm::Config,
    I: 'static,
{
    type Success = T::AccountId;

    fn try_address_origin(
        address: &H160,
        origin: T::RuntimeOrigin,
    ) -> Result<Self::Success, T::RuntimeOrigin> {
        // Convert H160 address to AccountId using the runtime's address mapping
        let account_id = T::AddressMapping::into_account_id(*address);

        // Ensure origin is signed
        let who = frame_system::ensure_signed(origin.clone()).map_err(|_| origin.clone())?;

        // Check if the address matches the signed origin
        if who != account_id {
            return Err(origin);
        }

        // Check if deployer is authorized via the pallet
        if pallet_evm_deployment_control::Pallet::<T>::is_authorized(&who) {
            return Ok(who);
        }

        // Deployment not authorized
        Err(origin)
    }
}
