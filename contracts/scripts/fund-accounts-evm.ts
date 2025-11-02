import { ethers } from 'ethers';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { computeAddress } from 'ethers';

// Configuration
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://127.0.0.1:8545';
const FUNDING_AMOUNT = '1000000000000000000000'; // 1000 UNIT (18 decimals)

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
const ACCOUNT_COUNT = 4;

// Alice's private key (well-known dev account)
// Derived from //Alice with ethereum signature scheme
const ALICE_PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';

/**
 * Derive Ethereum addresses from mnemonic (same as Hardhat does)
 */
function deriveHardhatAccounts(mnemonic: string, count: number): string[] {
  const seed = mnemonicToSeedSync(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);

  const accounts: string[] = [];

  for (let i = 0; i < count; i++) {
    const path = `m/44'/60'/0'/0/${i}`;
    const child = masterKey.derive(path);

    if (child.publicKey) {
      const address = computeAddress('0x' + Buffer.from(child.publicKey).toString('hex'));
      accounts.push(address);
    }
  }

  return accounts;
}

async function main() {
  console.log('🚀 Funding Hardhat accounts via EVM transfers...\n');

  await cryptoWaitReady();

  // Connect to EVM endpoint
  console.log(`📡 Connecting to ${RPC_ENDPOINT}...`);
  const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);

  // Get chain info
  const network = await provider.getNetwork();
  console.log(`✅ Connected to chain ID: ${network.chainId}\n`);

  // Create Alice's wallet (she has pre-funded EVM balance in genesis)
  const alice = new ethers.Wallet(ALICE_PRIVATE_KEY, provider);
  console.log(`👤 Funder: Alice (${alice.address})`);

  const aliceBalance = await provider.getBalance(alice.address);
  console.log(`💰 Alice's balance: ${aliceBalance.toString()} (${ethers.formatUnits(aliceBalance, 18)} UNIT)\n`);

  // Derive the Hardhat accounts
  console.log('🔑 Deriving Hardhat accounts from mnemonic...\n');
  const accounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, ACCOUNT_COUNT);

  console.log('Accounts to fund:');
  accounts.forEach((address, i) => {
    console.log(`  ${i}: ${address}`);
  });
  console.log('');

  // Get current base fee for gas price calculation
  const latestBlock = await provider.getBlock('latest');
  const baseFee = latestBlock?.baseFeePerGas || BigInt(1000000000);
  const gasPrice = baseFee * BigInt(2);

  console.log(`⛽ Base Fee: ${baseFee.toString()}, Using Gas Price: ${gasPrice.toString()}\n`);

  // Fund each account via EVM transfer
  console.log('💸 Starting EVM transfers...\n');

  for (let i = 0; i < accounts.length; i++) {
    const recipient = accounts[i];

    console.log(`  📤 Funding Account ${i} (${recipient})...`);

    try {
      // Send transfer transaction
      const tx = await alice.sendTransaction({
        to: recipient,
        value: FUNDING_AMOUNT,
        gasPrice: gasPrice,
        gasLimit: 21000 // Standard ETH transfer gas
      });

      console.log(`  ✅ Transaction sent: ${tx.hash}`);
      console.log(`  ⏳ Waiting for confirmation...`);

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      console.log(`  ✅ Transaction confirmed in block: ${receipt?.blockNumber}`);
    } catch (error) {
      console.error(`  ❌ Failed to fund Account ${i}:`, error);
    }

    console.log('');
  }

  // Check final balances
  console.log('📊 Final balances:\n');

  for (let i = 0; i < accounts.length; i++) {
    const address = accounts[i];
    const balance = await provider.getBalance(address);
    console.log(`  Account ${i}: ${balance.toString()} (${ethers.formatUnits(balance, 18)} UNIT)`);
  }

  console.log('\n✨ Funding complete!');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => process.exit());
