import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

// Configuration
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://127.0.0.1:45843';

// Alice's known test account seed (sudo account)
const ALICE_SEED = '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a';

/**
 * Wait for transaction to be finalized
 */
async function waitForFinalization(api: ApiPromise, txHash: string): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;

    const checkBlock = async () => {
      if (resolved) return;

      const block = await api.rpc.chain.getBlock();
      const blockNumber = block.block.header.number.toNumber();
      console.log(`    ⏳ Waiting for finalization... (current block: ${blockNumber})`);

      // Wait a bit and check again
      setTimeout(async () => {
        if (!resolved) {
          await checkBlock();
        }
      }, 3000);
    };

    checkBlock();

    // Set a timeout to resolve after 12 seconds
    setTimeout(() => {
      resolved = true;
      resolve();
    }, 12000);
  });
}

/**
 * Authorize a deployer account
 * @param accountAddress - The Ethereum H160 address to authorize
 * @returns true if successful, false otherwise
 */
export async function approveDeployer(accountAddress: string): Promise<boolean> {
  console.log(`🔐 Authorizing deployer: ${accountAddress}\n`);

  // Wait for crypto to be ready
  await cryptoWaitReady();

  // Connect to the chain
  console.log(`📡 Connecting to ${WS_ENDPOINT}...`);
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  // Get chain info
  const chain = await api.rpc.system.chain();
  console.log(`✅ Connected to ${chain}\n`);

  // Initialize keyring
  const keyring = new Keyring({ type: 'ethereum' });

  // Get Alice's account (sudo)
  const alice = keyring.addFromSeed(Buffer.from(ALICE_SEED.slice(2), 'hex'));
  console.log(`👤 Sudo Account: Alice (${alice.address})\n`);

  try {
    // Create the authorization transaction
    const authorizeTx = api.tx.evmDeploymentControl.authorizeDeployer(accountAddress);

    // Wrap it in sudo
    const sudoTx = api.tx.sudo.sudo(authorizeTx);

    // Sign and send
    console.log('  📤 Submitting sudo transaction...');
    const hash = await sudoTx.signAndSend(alice);
    console.log(`  ✅ Transaction sent: ${hash.toString()}`);

    // Wait for finalization
    await waitForFinalization(api, hash.toString());

    // Verify authorization
    const isAuthorized = await api.query.evmDeploymentControl.authorizedDeployers(accountAddress);

    await api.disconnect();

    if (isAuthorized.isSome) {
      console.log(`  ✅ Account ${accountAddress} is now authorized!\n`);
      return true;
    } else {
      console.log(`  ⚠️  Account authorization status unclear (may need more time)\n`);
      return false;
    }
  } catch (error) {
    console.error('  ❌ Failed to authorize account:', error);
    await api.disconnect();
    return false;
  }
}

/**
 * Check if an account is authorized for deployment
 * @param accountAddress - The Ethereum H160 address to check
 * @returns true if authorized, false otherwise
 */
export async function isDeployerAuthorized(accountAddress: string): Promise<boolean> {
  await cryptoWaitReady();

  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  try {
    const isAuthorized = await api.query.evmDeploymentControl.authorizedDeployers(accountAddress);
    await api.disconnect();
    return isAuthorized.isSome;
  } catch (error) {
    console.error('  ❌ Failed to check authorization status:', error);
    await api.disconnect();
    return false;
  }
}

// If running as a script (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const accountToAuthorize = process.argv[2];

  if (!accountToAuthorize) {
    console.error('❌ Error: No account address provided');
    console.log('\nUsage:');
    console.log('  npm run approve-deployer <account-address>');
    console.log('\nExample:');
    console.log('  npm run approve-deployer 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    process.exit(1);
  }

  // Validate Ethereum address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(accountToAuthorize)) {
    console.error('❌ Error: Invalid Ethereum address format');
    console.log('Address must be a 40-character hex string with 0x prefix');
    process.exit(1);
  }

  approveDeployer(accountToAuthorize)
    .then((success) => {
      if (success) {
        console.log('✨ Authorization complete!');
        process.exit(0);
      } else {
        console.error('❌ Authorization failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
