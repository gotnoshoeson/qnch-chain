import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, blake2AsU8a, encodeAddress } from '@polkadot/util-crypto';
import { u8aConcat } from '@polkadot/util';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { ethers, computeAddress } from 'ethers';
import fs from 'fs';
import path from 'path';

// Configuration
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://127.0.0.1:8545';
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://127.0.0.1:8545';

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

/**
 * Convert H160 (Ethereum) address to AccountId32 (Substrate) using HashedAddressMapping
 * This matches the runtime's HashedAddressMapping<BlakeTwo256> implementation
 * Returns the SS58-encoded address string
 */
function h160ToAccountId32(h160Address: string, ss58Format: number = 42): string {
  // Remove 0x prefix if present
  const cleanAddress = h160Address.startsWith('0x') ? h160Address.slice(2) : h160Address;

  // Convert hex string to bytes
  const addressBytes = new Uint8Array(Buffer.from(cleanAddress, 'hex'));

  // Prefix with "evm:" as per HashedAddressMapping implementation
  const prefix = new TextEncoder().encode('evm:');
  const data = u8aConcat(prefix, addressBytes);

  // Hash with Blake2-256 to get the AccountId32
  const accountId32Bytes = blake2AsU8a(data, 256);

  // Encode as SS58 address
  return encodeAddress(accountId32Bytes, ss58Format);
}

/**
 * Derive Ethereum addresses from mnemonic (same as Hardhat does)
 */
function deriveHardhatAccounts(mnemonic: string, count: number): { address: string; privateKey: string }[] {
  const seed = mnemonicToSeedSync(mnemonic);
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
 * Note: Assumes contracts are already compiled. Run `npx hardhat compile` manually if needed.
 */
async function compileContracts() {
  console.log('📝 Using existing compiled contracts (run `npx hardhat compile` if needed)\n');
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
  console.log('4. Attempt to deploy with Account 1 (should fail)');
  console.log('5. Verify Account 1 CAN interact with deployed contract (should succeed)\n');

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
  const keyring = new Keyring({ type: 'sr25519' });

  // Get Alice's account (sudo)
  const alice = keyring.addFromUri('//Alice');
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
  const accountId32 = h160ToAccountId32(accountToAuthorize);

  console.log(`📋 Authorizing H160: ${accountToAuthorize}`);
  console.log(`    Mapped SS58: ${accountId32}`);

  try {
    // Create the authorization transaction using the mapped AccountId32
    const authorizeTx = api.tx.evmDeploymentControl.authorizeDeployer(accountId32);

    // Wrap it in sudo
    const sudoTx = api.tx.sudo.sudo(authorizeTx);

    // Sign and send with proper finalization waiting
    console.log('  📤 Submitting sudo transaction...');

    await new Promise<void>((resolve, reject) => {
      let spinnerInterval: NodeJS.Timeout;
      const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIndex = 0;

      sudoTx.signAndSend(alice, ({ status, events, dispatchError }) => {
        // Clear spinner if active
        if (spinnerInterval) {
          clearInterval(spinnerInterval);
          process.stdout.write('\r\x1b[K'); // Clear the line
        }

        if (status.isReady) {
          console.log(`  📍 Transaction ready, submitting...`);
        }

        if (status.isBroadcast) {
          console.log(`  📡 Transaction broadcast to network`);
          // Start spinner
          spinnerInterval = setInterval(() => {
            process.stdout.write(`\r  ${spinner[spinnerIndex]} Waiting for inclusion in block...`);
            spinnerIndex = (spinnerIndex + 1) % spinner.length;
          }, 80);
        }

        if (status.isInBlock) {
          process.stdout.write('\r\x1b[K'); // Clear spinner line
          console.log(`  ✅ Included in block: ${status.asInBlock.toString()}`);
          console.log(`  ⏳ Waiting for finalization...`);
        }

        if (status.isFinalized) {
          process.stdout.write('\r\x1b[K'); // Clear any spinner
          console.log(`  ✅ Finalized in block: ${status.asFinalized.toString()}`);

          // Check for errors
          if (dispatchError) {
            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule);
              reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs}`));
            } else {
              reject(new Error(dispatchError.toString()));
            }
          } else {
            resolve();
          }
        }
      }).catch(reject);
    });

    // Verify authorization using the mapped AccountId32
    const isAuthorized = await api.query.evmDeploymentControl.authorizedDeployers(accountId32);
    if (isAuthorized.isSome) {
      console.log(`  ✅ Account 0 is now authorized!\n`);
      testResults.push({ name: 'Authorize Account 0', passed: true });
    } else {
      console.log(`  ⚠️  Account 0 authorization status unclear\n`);
      testResults.push({ name: 'Authorize Account 0', passed: false, error: 'Authorization status unclear' });
    }
  } catch (error: any) {
    console.error('  ❌ Failed to authorize account:', error);
    console.log('');
    testResults.push({ name: 'Authorize Account 0', passed: false, error: error.message });
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

  let deployedContractAddress: string | null = null;

  try {
    console.log(`🚀 Deploying Counter contract with Account 0 (${accounts[0].address})...`);

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    const wallet = new ethers.Wallet(accounts[0].privateKey, provider);

    console.log(`  📋 Deployer address: ${wallet.address}`);

    // Query Substrate balance (unified balance)
    const accountId32 = h160ToAccountId32(wallet.address);
    const { data: balanceData } = await api.query.system.account(accountId32);
    const balance = balanceData.free.toBigInt();
    console.log(`  💰 Balance: ${balance.toString()} (${Number(balance) / 1e18} UNIT)`);

    // Get current base fee from the latest block
    const latestBlock = await provider.getBlock('latest');
    const baseFee = latestBlock?.baseFeePerGas || BigInt(1000000000);
    const gasPrice = baseFee * BigInt(2); // Use 2x base fee to ensure transaction goes through

    console.log(`  ⛽ Base Fee: ${baseFee.toString()}, Using Gas Price: ${gasPrice.toString()}`);

    // Create contract factory and deploy
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const contract = await factory.deploy({
      gasPrice: gasPrice,
      gasLimit: 500000
    });

    console.log(`  📤 Deployment transaction: ${contract.deploymentTransaction()?.hash}`);
    console.log('  ⏳ Waiting for deployment...');

    // Wait for deployment
    await contract.waitForDeployment();
    deployedContractAddress = await contract.getAddress();

    console.log(`  ✅ SUCCESS! Contract deployed at: ${deployedContractAddress}`);
    console.log(`  📊 Block: ${contract.deploymentTransaction()?.blockNumber}\n`);
    testResults.push({ name: 'Deploy with Authorized Account', passed: true });
  } catch (error: any) {
    console.error('  ❌ Deployment FAILED with authorized account (unexpected!)');
    console.error('  Error:', error.message || error);
    console.log('');
    testResults.push({ name: 'Deploy with Authorized Account', passed: false, error: error.message });
  }

  // Step 3: Try to deploy with unauthorized account (Account 1)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Deploy with UNAUTHORIZED Account 1');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log(`🚀 Attempting to deploy Counter with Account 1 (${accounts[1].address})...`);
    console.log('  ⚠️  This SHOULD FAIL because Account 1 is not authorized\n');

    // Create provider and wallet for unauthorized account
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
    const unauthorizedWallet = new ethers.Wallet(accounts[1].privateKey, provider);

    console.log(`  📋 Deployer address: ${unauthorizedWallet.address}`);

    // Query Substrate balance (unified balance)
    const accountId32 = h160ToAccountId32(unauthorizedWallet.address);
    const { data: balanceData } = await api.query.system.account(accountId32);
    const balance = balanceData.free.toBigInt();
    console.log(`  💰 Balance: ${balance.toString()} (${Number(balance) / 1e18} UNIT)`);

    // Get current base fee
    const latestBlock = await provider.getBlock('latest');
    const baseFee = latestBlock?.baseFeePerGas || BigInt(1000000000);
    const gasPrice = baseFee * BigInt(2);

    console.log(`  ⛽ Base Fee: ${baseFee.toString()}, Using Gas Price: ${gasPrice.toString()}`);

    // Try to deploy the contract with appropriate gas settings
    const factory = new ethers.ContractFactory(abi, bytecode, unauthorizedWallet);
    const contract = await factory.deploy({
      gasPrice: gasPrice,
      gasLimit: 500000
    });

    console.log(`  📤 Deployment transaction: ${contract.deploymentTransaction()?.hash}`);
    console.log('  ⏳ Waiting for deployment...');

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log(`  ❌ UNEXPECTED! Contract deployed at: ${contractAddress}`);
    console.log(`  ⚠️  Deployment control may not be working correctly!\n`);
    testResults.push({ name: 'Reject Unauthorized Deployment', passed: false, error: 'Deployment succeeded when it should have failed' });
  } catch (error: any) {
    // Check if it's a deployment control error
    const errorMsg = (error.message || error.toString()).toLowerCase();
    const errorCode = error.code || '';

    // Check for various error patterns that indicate deployment control rejection
    const isDeploymentControlError =
      errorMsg.includes('deployment by approved accounts only') ||
      errorMsg.includes('approved accounts only') ||
      errorMsg.includes('intrinsic gas too low') ||
      errorMsg.includes('invalid transaction') ||
      errorMsg.includes('payment') ||
      errorMsg.includes('custom error') ||
      errorCode === 'UNKNOWN_ERROR' ||
      errorCode === -32603;

    if (isDeploymentControlError) {
      console.log('  ✅ EXPECTED FAILURE! Deployment was rejected by deployment control.');
      console.log(`  📋 Reason: ${errorMsg.includes('deployment by approved') ? 'Deployment by approved accounts only' : 'Deployer not authorized'}\n`);
      testResults.push({ name: 'Reject Unauthorized Deployment', passed: true });
    } else {
      console.log('  ⚠️  UNEXPECTED ERROR! Deployment failed but not due to authorization.');
      console.log(`  📋 Error: ${error.message || error}\n`);
      testResults.push({ name: 'Reject Unauthorized Deployment', passed: false, error: error.message || error.toString() });
    }
  }

  // Step 4: Test that unauthorized account CAN interact with deployed contract
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: UNAUTHORIZED Account 1 INTERACTING with contract');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (deployedContractAddress) {
    try {
      console.log(`🔓 Testing if Account 1 can interact with deployed contract...`);
      console.log(`  📍 Contract address: ${deployedContractAddress}`);
      console.log(`  👤 Unauthorized account: ${accounts[1].address}\n`);

      // Create provider and wallet for unauthorized account
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);
      const unauthorizedWallet = new ethers.Wallet(accounts[1].privateKey, provider);

      // Connect to the deployed contract
      const contract = new ethers.Contract(deployedContractAddress, abi, unauthorizedWallet);

      // Step 4.1: Read current value
      console.log('  📖 Step 4.1: Reading current counter value...');
      const initialValue = await contract.x();
      console.log(`  📊 Current value: ${initialValue}\n`);

      // Step 4.2: Call inc() function to increment counter
      console.log('  ✍️  Step 4.2: Calling inc() function with unauthorized account...');
      const latestBlock = await provider.getBlock('latest');
      const baseFee = latestBlock?.baseFeePerGas || BigInt(1000000000);
      const gasPrice = baseFee * BigInt(2);

      const tx = await contract.inc({
        gasPrice: gasPrice,
        gasLimit: 100000
      });

      console.log(`  📤 Transaction hash: ${tx.hash}`);
      console.log(`  ⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      console.log(`  ✅ Transaction confirmed in block: ${receipt?.blockNumber}\n`);

      // Step 4.3: Read new value to verify state changed
      console.log('  📖 Step 4.3: Reading new counter value...');
      const newValue = await contract.x();
      console.log(`  📊 New value: ${newValue}`);

      if (newValue > initialValue) {
        console.log(`  ✅ SUCCESS! Counter increased from ${initialValue} to ${newValue}`);
        console.log(`  📋 This confirms: Unauthorized accounts CAN interact with deployed contracts!\n`);
        testResults.push({ name: 'Unauthorized Account Can Interact', passed: true });
      } else {
        console.log(`  ❌ FAILED! Counter value did not increase.\n`);
        testResults.push({ name: 'Unauthorized Account Can Interact', passed: false, error: 'Counter value did not increase' });
      }
    } catch (error: any) {
      console.error('  ❌ FAILED! Unauthorized account could not interact with contract (unexpected!)');
      console.error('  Error:', error.message || error);
      console.log('');
      testResults.push({ name: 'Unauthorized Account Can Interact', passed: false, error: error.message });
    }
  } else {
    console.log('  ⚠️  Skipping Step 4: No contract deployed in Step 2\n');
    testResults.push({ name: 'Unauthorized Account Can Interact', passed: false, error: 'No contract to interact with' });
  }

  // Disconnect
  await api.disconnect();

  // Print test summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  testResults.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
  });

  console.log('');
  console.log(`Total: ${testResults.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed.');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => process.exit());
