import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { computeAddress } from 'ethers';
import hre from 'hardhat';
import fs from 'fs';
import path from 'path';

// Configuration
const WS_ENDPOINT = 'ws://127.0.0.1:45843'; // Update this to your parachain endpoint

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

// Alice's known test account seed (sudo account)
const ALICE_SEED = '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a';

/**
 * Derive Ethereum addresses from mnemonic (same as Hardhat does)
 */
function deriveHardhatAccounts(mnemonic: string, count: number): { address: string; privateKey: string }[] {
  const seed = mnemonicToSeed(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);

  const accounts: { address: string; privateKey: string }[] = [];

  for (let i = 0; i < count; i++) {
    // Hardhat uses the path: m/44'/60'/0'/0/i
    const path = `m/44'/60'/0'/0/${i}`;
    const child = masterKey.derive(path);

    if (child.publicKey && child.privateKey) {
      // Compute the Ethereum address from the public key
      const address = computeAddress('0x' + Buffer.from(child.publicKey).toString('hex'));
      const privateKey = '0x' + Buffer.from(child.privateKey).toString('hex');
      accounts.push({ address, privateKey });
    }
  }

  return accounts;
}

/**
 * Wait for transaction to be finalized
 */
async function waitForFinalization(api: ApiPromise, txHash: string): Promise<void> {
  return new Promise((resolve) => {
    let unsubscribe: () => void;

    const checkBlock = async () => {
      const block = await api.rpc.chain.getBlock();
      const blockNumber = block.block.header.number.toNumber();
      console.log(`    ⏳ Waiting for finalization... (current block: ${blockNumber})`);

      // Wait a bit and check again
      setTimeout(async () => {
        if (unsubscribe) {
          resolve();
        } else {
          await checkBlock();
        }
      }, 3000);
    };

    checkBlock();

    // Also set a timeout to resolve after 12 seconds
    setTimeout(() => {
      resolve();
    }, 12000);
  });
}

/**
 * Compile contracts
 */
async function compileContracts() {
  console.log('📝 Compiling contracts...');
  await hre.run('compile');
  console.log('✅ Contracts compiled\n');
}

/**
 * Get compiled contract bytecode and ABI
 */
function getCompiledContract(contractName: string): { bytecode: string; abi: any } {
  const artifactPath = path.join(
    process.cwd(),
    'artifacts',
    'contracts',
    `${contractName}.sol`,
    `${contractName}.json`
  );

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    bytecode: artifact.bytecode,
    abi: artifact.abi
  };
}

async function main() {
  console.log('🚀 Testing EVM Deployment Control\n');
  console.log('This script will:');
  console.log('1. Derive H160 addresses from test mnemonic');
  console.log('2. Authorize Account 0 for deployment');
  console.log('3. Deploy Counter contract with Account 0 (should succeed)');
  console.log('4. Attempt to deploy with Account 1 (should fail)\n');

  // Wait for crypto to be ready
  await cryptoWaitReady();

  // Connect to the chain
  console.log(`📡 Connecting to ${WS_ENDPOINT}...`);
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  // Get chain info
  const chain = await api.rpc.system.chain();
  console.log(`✅ Connected to ${chain}\n`);

  // Initialize keyring for Substrate/Polkadot accounts
  const keyring = new Keyring({ type: 'ethereum' });

  // Get Alice's account (sudo)
  const alice = keyring.addFromSeed(Buffer.from(ALICE_SEED.slice(2), 'hex'));
  console.log(`👤 Sudo Account: Alice (${alice.address})\n`);

  // Derive the first 2 Hardhat accounts
  console.log('🔑 Deriving Hardhat accounts from mnemonic...\n');
  const accounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, 2);

  console.log('Test Accounts:');
  accounts.forEach((account, i) => {
    console.log(`  Account ${i}: ${account.address}`);
  });
  console.log('');

  // Step 1: Authorize Account 0
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Authorize Account 0 for deployment');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const accountToAuthorize = accounts[0].address;
  console.log(`📋 Authorizing: ${accountToAuthorize}`);

  try {
    // Create the authorization transaction
    const authorizeTx = api.tx.evmDeploymentControl.authorizeDeployer(accountToAuthorize);

    // Wrap it in sudo
    const sudoTx = api.tx.sudo.sudo(authorizeTx);

    // Sign and send
    console.log('  📤 Submitting sudo transaction...');
    const hash = await sudoTx.signAndSend(alice);
    console.log(`  ✅ Transaction sent: ${hash.toString()}`);

    // Wait for finalization
    await waitForFinalization(api, hash.toString());

    // Verify authorization
    const isAuthorized = await api.query.evmDeploymentControl.authorizedDeployers(accountToAuthorize);
    if (isAuthorized.isSome) {
      console.log(`  ✅ Account 0 is now authorized!\n`);
    } else {
      console.log(`  ⚠️  Account 0 authorization status unclear (may need more time)\n`);
    }
  } catch (error) {
    console.error('  ❌ Failed to authorize account:', error);
    console.log('');
  }

  // Step 2: Deploy with authorized account (Account 0)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Deploy with AUTHORIZED Account 0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Compile contracts first
  await compileContracts();

  // Get contract bytecode
  const { bytecode, abi } = getCompiledContract('Counter');
  console.log(`📦 Contract bytecode length: ${bytecode.length} bytes\n`);

  try {
    console.log(`🚀 Deploying Counter contract with Account 0 (${accounts[0].address})...`);

    // Use viem to deploy
    const publicClient = await hre.viem.getPublicClient({
      networkName: 'qnch'
    });

    const [deployer] = await hre.viem.getWalletClients({
      networkName: 'qnch'
    });

    console.log(`  📋 Deployer address: ${deployer.account.address}`);

    // Deploy the contract
    const hash = await deployer.deployContract({
      abi,
      bytecode: bytecode as `0x${string}`,
    });

    console.log(`  📤 Deployment transaction: ${hash}`);
    console.log('  ⏳ Waiting for transaction receipt...');

    // Wait for the transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.contractAddress) {
      console.log(`  ✅ SUCCESS! Contract deployed at: ${receipt.contractAddress}`);
      console.log(`  📊 Gas used: ${receipt.gasUsed.toString()}\n`);
    } else {
      console.log(`  ❌ Deployment failed - no contract address in receipt`);
      console.log(`  Receipt status: ${receipt.status}\n`);
    }
  } catch (error: any) {
    console.error('  ❌ Deployment FAILED with authorized account (unexpected!)');
    console.error('  Error:', error.message || error);
    console.log('');
  }

  // Step 3: Try to deploy with unauthorized account (Account 1)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Deploy with UNAUTHORIZED Account 1');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log(`🚀 Attempting to deploy Counter with Account 1 (${accounts[1].address})...`);
    console.log('  ⚠️  This SHOULD FAIL because Account 1 is not authorized\n');

    // Get wallet client for account 1
    const publicClient = await hre.viem.getPublicClient({
      networkName: 'qnch'
    });

    const walletClients = await hre.viem.getWalletClients({
      networkName: 'qnch'
    });

    // Use the second account (index 1)
    const unauthorizedDeployer = walletClients[1];

    console.log(`  📋 Deployer address: ${unauthorizedDeployer.account.address}`);

    // Try to deploy the contract
    const hash = await unauthorizedDeployer.deployContract({
      abi,
      bytecode: bytecode as `0x${string}`,
    });

    console.log(`  📤 Deployment transaction: ${hash}`);
    console.log('  ⏳ Waiting for transaction receipt...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.contractAddress) {
      console.log(`  ❌ UNEXPECTED! Contract deployed at: ${receipt.contractAddress}`);
      console.log(`  ⚠️  Deployment control may not be working correctly!\n`);
    } else {
      console.log(`  ❌ Deployment rejected (status: ${receipt.status})`);
      console.log(`  ⚠️  Transaction was processed but deployment failed\n`);
    }
  } catch (error: any) {
    console.log('  ✅ EXPECTED FAILURE! Deployment was rejected.');
    console.log(`  📋 Error: ${error.message || error}\n`);
  }

  // Disconnect
  await api.disconnect();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Test complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => process.exit());
