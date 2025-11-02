import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { computeAddress } from 'ethers';
import { approveDeployer, isDeployerAuthorized } from '../scripts/approve-deployer.js';

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

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

describe("EVM Deployment Control", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  // Derive test accounts
  const testAccounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, 10);
  const authorizedAccount = testAccounts[0]; // Account 0 - will be approved
  const unauthorizedAccount = testAccounts[1]; // Account 1 - will NOT be approved

  console.log('\n🔑 Test Accounts:');
  console.log(`  Account 0 (authorized): ${authorizedAccount.address}`);
  console.log(`  Account 1 (unauthorized): ${unauthorizedAccount.address}\n`);

  before(async function () {
    console.log('\n📋 Setup: Authorizing Account 0 for deployment...\n');

    // Approve Account 0
    const success = await approveDeployer(authorizedAccount.address);
    assert.ok(success, 'Failed to authorize Account 0');

    // Verify authorization
    const isAuthorized = await isDeployerAuthorized(authorizedAccount.address);
    assert.ok(isAuthorized, 'Account 0 should be authorized after approval');

    // Verify Account 1 is NOT authorized
    const isUnauthorized = await isDeployerAuthorized(unauthorizedAccount.address);
    assert.ok(!isUnauthorized, 'Account 1 should NOT be authorized');

    console.log('  ✅ Setup complete!\n');
  });

  it("Should allow authorized account (Account 0) to deploy Counter contract", async function () {
    console.log('\n🚀 Test: Deploying Counter with AUTHORIZED Account 0...\n');

    // Get wallet clients
    const walletClients = await viem.getWalletClients();
    const authorizedWallet = walletClients[0]; // First wallet should be Account 0

    // Verify we're using the correct wallet
    assert.equal(
      authorizedWallet.account.address.toLowerCase(),
      authorizedAccount.address.toLowerCase(),
      'Wallet client 0 should match Account 0'
    );

    // Deploy the Counter contract with authorized account
    const counter = await viem.deployContract("Counter", {
      client: { wallet: authorizedWallet }
    });

    console.log(`  ✅ Contract deployed successfully at: ${counter.address}`);
    console.log(`  📋 Deployed by: ${authorizedWallet.account.address}\n`);

    // Verify the contract works
    const initialValue = await counter.read.x();
    assert.equal(initialValue, 0n, 'Initial counter value should be 0');

    // Test increment function
    await counter.write.inc();
    const newValue = await counter.read.x();
    assert.equal(newValue, 1n, 'Counter should be 1 after increment');

    console.log('  ✅ Contract is functional!\n');
  });

  it("Should reject deployment from unauthorized account (Account 1)", async function () {
    console.log('\n🚫 Test: Attempting to deploy Counter with UNAUTHORIZED Account 1...\n');

    // Get wallet clients
    const walletClients = await viem.getWalletClients();
    const unauthorizedWallet = walletClients[1]; // Second wallet should be Account 1

    // Verify we're using the correct wallet
    assert.equal(
      unauthorizedWallet.account.address.toLowerCase(),
      unauthorizedAccount.address.toLowerCase(),
      'Wallet client 1 should match Account 1'
    );

    console.log(`  📋 Attempting deployment with: ${unauthorizedWallet.account.address}`);

    // Attempt to deploy with unauthorized account - this should fail
    let deploymentFailed = false;
    let errorMessage = '';

    try {
      await viem.deployContract("Counter", {
        client: { wallet: unauthorizedWallet }
      });

      console.log('  ❌ UNEXPECTED: Deployment succeeded when it should have failed!\n');
    } catch (error: any) {
      deploymentFailed = true;
      errorMessage = error.message || String(error);
      console.log('  ✅ Deployment rejected as expected!');
      console.log(`  📋 Error: ${errorMessage}\n`);
    }

    assert.ok(
      deploymentFailed,
      'Deployment should fail for unauthorized account'
    );

    console.log('  ✅ Deployment control is working correctly!\n');
  });

  it("Should verify authorization status of both accounts", async function () {
    console.log('\n🔍 Test: Verifying authorization status...\n');

    // Check Account 0 is still authorized
    const isAccount0Authorized = await isDeployerAuthorized(authorizedAccount.address);
    assert.ok(isAccount0Authorized, 'Account 0 should remain authorized');
    console.log(`  ✅ Account 0 (${authorizedAccount.address}): AUTHORIZED`);

    // Check Account 1 is still NOT authorized
    const isAccount1Authorized = await isDeployerAuthorized(unauthorizedAccount.address);
    assert.ok(!isAccount1Authorized, 'Account 1 should remain unauthorized');
    console.log(`  ✅ Account 1 (${unauthorizedAccount.address}): UNAUTHORIZED\n`);
  });
});
