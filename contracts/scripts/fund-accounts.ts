import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { computeAddress } from 'ethers';

// Configuration
const WS_ENDPOINT = 'ws://127.0.0.1:45843'; // Update this to your parachain endpoint
const FUNDING_AMOUNT = '1000000000000000'; // 1000 tokens (adjust decimals based on your chain)

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
const ACCOUNT_COUNT = 10;

// Alice's known test account seed
const ALICE_SEED = '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a';

/**
 * Derive Ethereum addresses from mnemonic (same as Hardhat does)
 */
function deriveHardhatAccounts(mnemonic: string, count: number): string[] {
  const seed = mnemonicToSeed(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);

  const accounts: string[] = [];

  for (let i = 0; i < count; i++) {
    // Hardhat uses the path: m/44'/60'/0'/0/i
    const path = `m/44'/60'/0'/0/${i}`;
    const child = masterKey.derive(path);

    if (child.publicKey) {
      // Compute the Ethereum address from the public key
      const address = computeAddress('0x' + Buffer.from(child.publicKey).toString('hex'));
      accounts.push(address);
    }
  }

  return accounts;
}

async function main() {
  console.log('🚀 Starting funding script for Hardhat accounts...\n');

  // Wait for crypto to be ready
  await cryptoWaitReady();

  // Connect to the chain
  console.log(`📡 Connecting to ${WS_ENDPOINT}...`);
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  // Get chain info
  const chain = await api.rpc.system.chain();
  const chainDecimals = api.registry.chainDecimals[0] || 18;
  const chainToken = api.registry.chainTokens[0] || 'Unit';

  console.log(`✅ Connected to ${chain}`);
  console.log(`💰 Token: ${chainToken}, Decimals: ${chainDecimals}\n`);

  // Initialize keyring
  const keyring = new Keyring({ type: 'ethereum' });

  // Get Alice's account using her known private key
  const alice = keyring.addFromSeed(Buffer.from(ALICE_SEED.slice(2), 'hex'));
  console.log(`👤 Funder: Alice (${alice.address})\n`);

  // Get Alice's balance
  const { data: aliceBalance } = await api.query.system.account(alice.address);
  console.log(`💵 Alice's balance: ${aliceBalance.free.toString()} ${chainToken}\n`);

  // Derive the 10 Hardhat accounts
  console.log('🔑 Deriving Hardhat accounts from mnemonic...\n');
  const accounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, ACCOUNT_COUNT);

  console.log('Accounts to fund:');
  accounts.forEach((address, i) => {
    console.log(`  ${i}: ${address}`);
  });
  console.log('');

  // Fund each account
  console.log('💸 Starting transfers...\n');

  const transfers = [];

  for (let i = 0; i < accounts.length; i++) {
    const recipient = accounts[i];

    console.log(`  📤 Funding Account ${i} (${recipient})...`);

    try {
      // Create transfer transaction
      const transfer = api.tx.balances.transferKeepAlive(
        recipient,
        FUNDING_AMOUNT
      );

      // Sign and send transaction
      const hash = await transfer.signAndSend(alice);

      console.log(`  ✅ Transaction sent: ${hash.toString()}`);
      transfers.push({ account: i, address: recipient, hash: hash.toString() });
    } catch (error) {
      console.error(`  ❌ Failed to fund Account ${i}:`, error);
    }

    console.log('');
  }

  // Wait for transactions to be finalized
  console.log('⏳ Waiting for transactions to be finalized...\n');
  await new Promise(resolve => setTimeout(resolve, 12000));

  // Check balances of funded accounts
  console.log('📊 Final balances:\n');

  for (const { account, address } of transfers) {
    const { data: balance } = await api.query.system.account(address);
    console.log(`  Account ${account}: ${balance.free.toString()} ${chainToken}`);
  }

  // Disconnect
  await api.disconnect();
  console.log('\n✨ Funding complete!');
}

main()
  .catch(console.error)
  .finally(() => process.exit());
